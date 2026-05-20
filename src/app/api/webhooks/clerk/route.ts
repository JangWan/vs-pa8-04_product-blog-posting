import { Webhook } from "svix";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, organizations, organizationMembers, subscriptions, webhookEvents } from "@/db/schema";
import { eq, and, sql, ne } from "drizzle-orm";
import { ensurePersonalOrg } from "@/features/organizations/backend/ensure-personal-org";
import { recordSubscriptionHistory } from "@/features/billing/backend/service";
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_HISTORY_REASON, type SubscriptionStatus } from "@/lib/constants";

// ─── 이벤트 타입 정의 ───────────────────────────────────────────────────────

type UserCreatedEvent = {
  type: "user.created";
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
  };
};

type OrgMembershipCreatedEvent = {
  type: "organizationMembership.created";
  data: {
    id: string;
    role: string;
    organization: { id: string };
    public_user_data: { user_id: string };
    created_at: number;
  };
};

type OrgMembershipDeletedEvent = {
  type: "organizationMembership.deleted";
  data: {
    organization: { id: string };
    public_user_data: { user_id: string };
  };
};

type UserDeletedEvent = {
  type: "user.deleted";
  data: { id: string; deleted: boolean };
};

type WebhookEvent =
  | UserCreatedEvent
  | UserDeletedEvent
  | OrgMembershipCreatedEvent
  | OrgMembershipDeletedEvent
  | { type: string; data: unknown };

// ─── 멱등성: webhook_events 중복 방지 ────────────────────────────────────────

async function checkAndRecordEvent(
  eventId: string,
  eventType: string,
  payload: unknown
): Promise<boolean> {
  try {
    await db.insert(webhookEvents).values({
      id: crypto.randomUUID(),
      event_id: eventId,
      provider: "clerk",
      event_type: eventType,
      payload: payload as Record<string, unknown>,
    });
    return true; // 신규 이벤트
  } catch {
    return false; // 중복 (UNIQUE 충돌) → 이미 처리됨
  }
}


// ─── 메인 핸들러 ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const headersList = await headers();
  const svixId = headersList.get("svix-id");
  const svixTimestamp = headersList.get("svix-timestamp");
  const svixSignature = headersList.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json(
      { error: "CLERK_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const body = await req.text();
  const wh = new Webhook(webhookSecret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // 멱등성 체크 — 중복 이벤트는 조용히 200 반환
  const isNew = await checkAndRecordEvent(svixId, evt.type, JSON.parse(body));
  if (!isNew) {
    return Response.json({ ok: true, skipped: "duplicate" });
  }

  // ── user.created ─────────────────────────────────────────────────────────
  if (evt.type === "user.created") {
    const { id: clerkUserId, email_addresses, primary_email_address_id } =
      (evt as UserCreatedEvent).data;

    const list = Array.isArray(email_addresses) ? email_addresses : [];
    const primaryEmail = list.find((e) => e.id === primary_email_address_id);
    const email = primaryEmail?.email_address ?? list[0]?.email_address;

    if (!email) {
      return Response.json({ ok: true, skipped: "no_email" });
    }

    // users UPSERT
    const userId = crypto.randomUUID();
    await db
      .insert(users)
      .values({
        id: userId,
        clerk_user_id: clerkUserId,
        email,
        plan: "free",
        payment_customer_key: crypto.randomUUID(),
      })
      .onConflictDoNothing();

    // DB에서 실제 userId 조회 (이미 있을 수 있으므로)
    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerk_user_id, clerkUserId),
    });
    if (!dbUser) {
      return Response.json({ ok: true });
    }

    // 기본 팀(Personal Org) 자동 생성 (BR-31)
    try {
      await ensurePersonalOrg(dbUser.id, email, clerkUserId);
    } catch (err) {
      // 실패해도 webhook은 200 반환 (svix가 재시도하지 않도록)
      // 다음 GET /api/org 요청 시 보상 트랜잭션이 재시도
      console.error("[webhook] 기본 팀 생성 실패:", err);
    }
  }

  // ── organizationMembership.created ───────────────────────────────────────
  if (evt.type === "organizationMembership.created") {
    const { role, organization, public_user_data } =
      (evt as OrgMembershipCreatedEvent).data;

    const clerkOrgId = organization.id;
    const clerkUserId = public_user_data.user_id;

    const [org, user] = await Promise.all([
      db.query.organizations.findFirst({
        where: eq(organizations.clerk_org_id, clerkOrgId),
      }),
      db.query.users.findFirst({
        where: eq(users.clerk_user_id, clerkUserId),
      }),
    ]);

    if (org && user) {
      const normalizedRole = role.replace("org:", ""); // 'org:admin' → 'admin'
      await db
        .insert(organizationMembers)
        .values({
          id: crypto.randomUUID(),
          organization_id: org.id,
          user_id: user.id,
          role: normalizedRole,
          invited_by: null,
        })
        .onConflictDoNothing();

      // E-05: member_count 증가
      await db.update(organizations)
        .set({ member_count: sql`${organizations.member_count} + 1` })
        .where(eq(organizations.id, org.id));
    }
  }

  // ── organizationMembership.deleted ───────────────────────────────────────
  if (evt.type === "organizationMembership.deleted") {
    const { organization, public_user_data } =
      (evt as OrgMembershipDeletedEvent).data;

    const clerkOrgId = organization.id;
    const clerkUserId = public_user_data.user_id;

    const [org, user] = await Promise.all([
      db.query.organizations.findFirst({
        where: eq(organizations.clerk_org_id, clerkOrgId),
      }),
      db.query.users.findFirst({
        where: eq(users.clerk_user_id, clerkUserId),
      }),
    ]);

    if (org && user) {
      await db
        .delete(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organization_id, org.id),
            eq(organizationMembers.user_id, user.id)
          )
        );

      // E-06: member_count 감소 (GREATEST 0 보장)
      await db.update(organizations)
        .set({ member_count: sql`GREATEST(${organizations.member_count} - 1, 0)` })
        .where(eq(organizations.id, org.id));

      // E-04: 탈퇴자가 팀 결제자인 경우 payer_warning=true
      const [payerSub] = await db.select({ id: subscriptions.id, status: subscriptions.status })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.organization_id, org.id),
          eq(subscriptions.payer_user_id, user.id),
          ne(subscriptions.status, SUBSCRIPTION_STATUS.CANCELED),
        ))
        .limit(1);

      if (payerSub) {
        await db.update(subscriptions)
          .set({ payer_warning: true })
          .where(eq(subscriptions.id, payerSub.id));

        await recordSubscriptionHistory({
          subscriptionId: payerSub.id,
          fromStatus: payerSub.status as SubscriptionStatus,
          toStatus: payerSub.status as SubscriptionStatus,
          fromPayerUserId: user.id,
          changedBy: user.id,
          reason: SUBSCRIPTION_HISTORY_REASON.PAYER_LEFT,
        });
      }
    }
  }

  // ── user.deleted — DB 사용자 레코드 삭제 (cascade로 연관 데이터 정리) ─────────
  if (evt.type === "user.deleted") {
    const { id: clerkUserId } = (evt as UserDeletedEvent).data;
    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerk_user_id, clerkUserId),
    });
    if (dbUser) {
      await db.delete(users).where(eq(users.id, dbUser.id));
    }
  }

  return Response.json({ ok: true });
}
