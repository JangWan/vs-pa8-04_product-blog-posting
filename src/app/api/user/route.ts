// 사용자 탈퇴 API (BR-P10)
// E-01: 팀 관리자 이전 체크
// E-02: 개인 구독 해지 예약
// E-03: 팀 결제자 payer_warning 설정

import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { organizations, organizationMembers, subscriptions, users } from "@/db/schema";
import { and, count, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { recordSubscriptionHistory } from "@/features/billing/backend/service";
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_HISTORY_REASON,
  type SubscriptionStatus,
} from "@/lib/constants";

export async function DELETE() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return Response.json({ error: "User not found" }, { status: 404 });

  const now = new Date();

  // ── E-01: 비-personal 팀의 관리자 상태 검증 ──────────────────────────────────
  const adminMemberships = await db
    .select({ orgId: organizations.id, orgName: organizations.name, clerkOrgId: organizations.clerk_org_id })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organization_id, organizations.id))
    .where(and(
      eq(organizationMembers.user_id, dbUser.id),
      eq(organizationMembers.role, "admin"),
      eq(organizations.is_default, false),
      isNull(organizations.deleted_at),
    ));

  const blockingOrgs: string[] = [];
  const soloOrgIds: string[] = [];

  for (const { orgId, orgName } of adminMemberships) {
    const [otherAdmins] = await db
      .select({ cnt: count(organizationMembers.id) })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organization_id, orgId),
        eq(organizationMembers.role, "admin"),
        ne(organizationMembers.user_id, dbUser.id),
      ));

    const [otherMembers] = await db
      .select({ cnt: count(organizationMembers.id) })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organization_id, orgId),
        ne(organizationMembers.user_id, dbUser.id),
      ));

    if (Number(otherAdmins.cnt) === 0 && Number(otherMembers.cnt) > 0) {
      // 다른 관리자 없고 다른 멤버 있음 → 차단
      blockingOrgs.push(orgName);
    } else if (Number(otherMembers.cnt) === 0) {
      // 혼자인 팀 → 자동 soft-delete 대상
      soloOrgIds.push(orgId);
    }
    // 다른 관리자 있음 → 문제없음
  }

  if (blockingOrgs.length > 0) {
    return Response.json({
      error: "ADMIN_HANDOFF_REQUIRED",
      message: "다른 관리자를 지정하거나 팀을 삭제한 후 탈퇴하세요.",
      blocking_orgs: blockingOrgs,
    }, { status: 409 });
  }

  // ── 혼자인 팀 soft-delete (D-01 로직 적용) ───────────────────────────────────
  for (const orgId of soloOrgIds) {
    await db.update(organizations)
      .set({ deleted_at: now })
      .where(eq(organizations.id, orgId));

    const [activeSub] = await db.select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.organization_id, orgId),
        isNotNull(subscriptions.billing_key_encrypted),
      ))
      .limit(1);

    if (activeSub) {
      await db.update(subscriptions).set({
        status: SUBSCRIPTION_STATUS.SUSPENDED,
        billing_key_encrypted: null,
        org_deleted_at: now,
      }).where(eq(subscriptions.id, activeSub.id));

      await recordSubscriptionHistory({
        subscriptionId: activeSub.id,
        fromStatus: activeSub.status as SubscriptionStatus,
        toStatus: SUBSCRIPTION_STATUS.SUSPENDED,
        billingKeyChanged: true,
        changedBy: dbUser.id,
        reason: SUBSCRIPTION_HISTORY_REASON.ORG_SOFT_DELETE,
      });
    }
  }

  // ── E-02: 개인 구독 해지 예약 ─────────────────────────────────────────────────
  const personalOrg = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.owner_user_id, dbUser.id),
      eq(organizations.is_default, true),
      isNull(organizations.deleted_at),
    ),
  });

  if (personalOrg) {
    const [activeSub] = await db.select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.organization_id, personalOrg.id),
        eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE),
      ))
      .limit(1);

    if (activeSub) {
      await db.update(subscriptions).set({
        status: SUBSCRIPTION_STATUS.CANCEL_SCHEDULED,
        cancel_scheduled_at: now,
        next_billing_at: null,
      }).where(eq(subscriptions.id, activeSub.id));

      await recordSubscriptionHistory({
        subscriptionId: activeSub.id,
        fromStatus: SUBSCRIPTION_STATUS.ACTIVE,
        toStatus: SUBSCRIPTION_STATUS.CANCEL_SCHEDULED,
        changedBy: dbUser.id,
        reason: SUBSCRIPTION_HISTORY_REASON.USER_DELETE,
      });
    }

    // 개인 org soft-delete
    await db.update(organizations)
      .set({ deleted_at: now })
      .where(eq(organizations.id, personalOrg.id));
  }

  // ── E-03: 팀 결제자 통보 (payer_warning=true) ─────────────────────────────────
  const payerSubs = await db
    .select({ id: subscriptions.id, status: subscriptions.status })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.payer_user_id, dbUser.id),
      ne(subscriptions.status, SUBSCRIPTION_STATUS.CANCELED),
    ));

  for (const sub of payerSubs) {
    await db.update(subscriptions)
      .set({ payer_warning: true })
      .where(eq(subscriptions.id, sub.id));

    await recordSubscriptionHistory({
      subscriptionId: sub.id,
      fromStatus: sub.status as SubscriptionStatus,
      toStatus: sub.status as SubscriptionStatus,
      fromPayerUserId: dbUser.id,
      changedBy: dbUser.id,
      reason: SUBSCRIPTION_HISTORY_REASON.PAYER_LEFT,
    });
  }

  // ── Clerk 계정 삭제 → user.deleted webhook이 DB 레코드 cascade 정리 ───────────
  const client = await clerkClient();
  await client.users.deleteUser(clerkUserId);

  return Response.json({ ok: true });
}
