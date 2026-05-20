// 기본 팀(Personal Org) 보장 유틸리티
// 사용자당 is_default=true 조직이 없을 때 보상 트랜잭션으로 DB-Clerk 동기화
// 호출처: webhooks/clerk (신규 가입) + GET /api/org (런타임 방어)
//
// 설계 원칙:
//   1. DB에 is_default=true org 있음 → 정상, default_organization_id만 보정
//   2. DB엔 없지만 Clerk에 personal org 있음 → Clerk 우선, DB에만 row 생성 (Clerk 중복 생성 방지)
//   3. 양쪽 모두 없음 → Clerk org 신규 생성 + DB 동기화

import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { organizations, organizationMembers, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export async function ensurePersonalOrg(
  userId: string,
  email: string,
  clerkUserId: string
): Promise<void> {
  // ── 1단계: DB에 is_default=true org가 이미 있으면 조기 반환 ──
  const existingDb = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.owner_user_id, userId),
      eq(organizations.is_default, true),
      isNull(organizations.deleted_at)
    ),
  });

  if (existingDb) {
    await db
      .update(users)
      .set({ default_organization_id: existingDb.id })
      .where(and(eq(users.id, userId), isNull(users.default_organization_id)));
    return;
  }

  // ── 2단계: Clerk에서 이 유저의 Personal Org 조회 (orphan 감지) ──
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({
    userId: clerkUserId,
    limit: 50,
  });

  const clerkPersonalOrg = memberships.data.find(
    (m) =>
      (m.organization.privateMetadata as Record<string, unknown>)?.is_personal === true
  );

  let clerkOrgId: string;
  let orgName: string;
  let orgSlug: string;

  if (clerkPersonalOrg) {
    // Clerk에 이미 있음 → DB만 동기화 (Clerk 중복 생성 방지)
    clerkOrgId = clerkPersonalOrg.organization.id;
    orgName = clerkPersonalOrg.organization.name;
    orgSlug = clerkPersonalOrg.organization.slug ?? `personal-${crypto.randomUUID().slice(0, 8)}`;
  } else {
    // ── 3단계: Clerk에도 없으면 신규 생성 ──
    orgName = `${email.split("@")[0]}'s Workspace`;
    orgSlug = `personal-${crypto.randomUUID().slice(0, 8)}`;

    const newClerkOrg = await client.organizations.createOrganization({
      name: orgName,
      slug: orgSlug,
      createdBy: undefined,
      privateMetadata: { is_personal: true },
    });

    clerkOrgId = newClerkOrg.id;
    orgSlug = newClerkOrg.slug ?? orgSlug;
  }

  // ── DB row 동기화 (clerk_org_id 충돌 시 CONFLICT 무시) ──
  const orgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  await db.batch([
    db
      .insert(organizations)
      .values({
        id: orgId,
        clerk_org_id: clerkOrgId,
        name: orgName,
        slug: orgSlug,
        owner_user_id: userId,
        is_default: true,
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
