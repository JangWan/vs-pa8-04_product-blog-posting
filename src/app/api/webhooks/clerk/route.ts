import { Webhook } from "svix";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, organizations, organizationMembers, webhookEvents } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

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

type WebhookEvent =
  | UserCreatedEvent
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

// ─── Personal Org 자동 생성 (UC-02 가입 후속, BR-31) ─────────────────────────
// ON CONFLICT DO NOTHING + DB unique index로 중복 생성 차단

async function createPersonalOrg(userId: string, email: string): Promise<void> {
  // 이미 Personal Org가 있으면 스킵
  const existing = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.owner_user_id, userId),
      eq(organizations.is_personal, true),
      isNull(organizations.deleted_at)
    ),
  });
  if (existing) {
    if (!users) return; // 타입 가드
    // default_organization_id만 보정
    await db
      .update(users)
      .set({ default_organization_id: existing.id })
      .where(and(eq(users.id, userId), isNull(users.default_organization_id)));
    return;
  }

  const orgName = `${email.split("@")[0]}'s Workspace`;
  const slug = `personal-${crypto.randomUUID().slice(0, 8)}`;

  // Clerk Organization 생성
  const client = await clerkClient();
  const clerkOrg = await client.organizations.createOrganization({
    name: orgName,
    slug,
    createdBy: undefined, // 시스템 생성
    privateMetadata: {
      idempotency_key: `personal-${userId}`,
      is_personal: true,
    },
  });

  const orgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  // DB INSERT — neon-http는 transaction 미지원, batch로 원자적 실행
  await db.batch([
    db
      .insert(organizations)
      .values({
        id: orgId,
        clerk_org_id: clerkOrg.id,
        name: orgName,
        slug: clerkOrg.slug ?? slug,
        owner_user_id: userId,
        plan: "free",
        is_personal: true,
      })
      .onConflictDoNothing(),
    db
      .insert(organizationMembers)
      .values({
        id: memberId,
        organization_id: orgId,
        user_id: userId,
        role: "admin",
        invited_by: null,
      })
      .onConflictDoNothing(),
    db
      .update(users)
      .set({ default_organization_id: orgId })
      .where(eq(users.id, userId)),
  ]);
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

    // Personal Org 자동 생성 (BR-31)
    try {
      await createPersonalOrg(dbUser.id, email);
    } catch (err) {
      // 실패해도 webhook은 200 반환 (svix가 재시도하지 않도록)
      // 다음 /dashboard 진입 시 미들웨어 보상 트랜잭션이 재시도
      console.error("[webhook] Personal Org 생성 실패:", err);
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
    }
  }

  return Response.json({ ok: true });
}
