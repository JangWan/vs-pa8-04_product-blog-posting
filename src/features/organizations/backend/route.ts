import { Hono } from "hono";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/db";
import { organizations, organizationMembers, subscriptions, users } from "@/db/schema";
import { eq, and, isNull, isNotNull, count, ne } from "drizzle-orm";
import { withOrganization } from "../middleware/with-organization";
import { withAdminRole } from "../middleware/with-admin-role";
import { ensurePersonalOrg } from "./ensure-personal-org";
import { recordSubscriptionHistory, validateInviteCapacity } from "@/features/billing/backend/service";
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_HISTORY_REASON, type SubscriptionStatus } from "@/lib/constants";

type Bindings = { userId: string | null; orgId: string | null };

const app = new Hono<{ Bindings: Bindings }>();

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

async function getDbUser(clerkUserId: string) {
  return db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
}

function getClerkUserId(c: { env: Bindings }): string | null {
  return c.env.userId;
}

// ─── GET /api/org — 내 조직 목록 ─────────────────────────────────────────────

app.get("/", async (c) => {
  const clerkUserId = getClerkUserId(c);
  if (!clerkUserId) return c.json({ error: "Unauthorized" }, 401);

  const dbUser = await getDbUser(clerkUserId);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  let memberships = await db
    .select({ org: organizations, member: organizationMembers })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organization_id, organizations.id))
    .where(eq(organizationMembers.user_id, dbUser.id));

  // 보상 트랜잭션: is_default=true 조직이 없으면 기본 팀 자동 생성
  const hasPersonalOrg = memberships.some(({ org }) => org.is_default);
  if (!hasPersonalOrg) {
    try {
      await ensurePersonalOrg(dbUser.id, dbUser.email, clerkUserId);
      // 생성 후 목록 재조회
      memberships = await db
        .select({ org: organizations, member: organizationMembers })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizationMembers.organization_id, organizations.id))
        .where(eq(organizationMembers.user_id, dbUser.id));
    } catch (err) {
      // 생성 실패해도 기존 목록으로 응답 (다음 요청에서 재시도)
      console.error("[GET /api/org] 기본 팀 자동 생성 실패:", err);
    }
  }

  // default_organization_id가 유효하지 않으면 is_default=true 조직으로 보정
  const updatedUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  }) ?? dbUser;

  const memberCounts = await db
    .select({
      organization_id: organizationMembers.organization_id,
      cnt: count(organizationMembers.id),
    })
    .from(organizationMembers)
    .groupBy(organizationMembers.organization_id);

  const countMap = new Map(memberCounts.map((r) => [r.organization_id, Number(r.cnt)]));

  const data = memberships.map(({ org, member }) => ({
    id: org.id,
    clerk_org_id: org.clerk_org_id,
    name: org.name,
    slug: org.slug,
    plan_product_id: org.plan_product_id,
    is_default: org.is_default,
    deleted_at: org.deleted_at,
    role: member.role,
    member_count: countMap.get(org.id) ?? 0,
    is_last_active: org.id === updatedUser.default_organization_id,
  }));

  return c.json({ data });
});

// ─── POST /api/org — 조직 생성 (UC-23) ───────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(48).optional(),
});

app.post("/", async (c) => {
  const clerkUserId = getClerkUserId(c);
  if (!clerkUserId) return c.json({ error: "Unauthorized" }, 401);

  const parsed = createOrgSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);

  const { name, slug: rawSlug } = parsed.data;
  const slug =
    rawSlug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const dbUser = await getDbUser(clerkUserId);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  const client = await clerkClient();

  // 슬러그 충돌 시 suffix를 붙여 최대 3회 재시도
  let clerkOrg;
  let finalSlug = slug;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      clerkOrg = await client.organizations.createOrganization({
        name,
        slug: finalSlug,
        createdBy: clerkUserId,
      });
      break;
    } catch (err: unknown) {
      const isSlugConflict =
        typeof err === "object" &&
        err !== null &&
        "errors" in err &&
        Array.isArray((err as { errors: { code: string }[] }).errors) &&
        (err as { errors: { code: string }[] }).errors.some(
          (e) => e.code === "form_identifier_exists"
        );

      if (isSlugConflict && attempt < 2) {
        finalSlug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
      } else {
        return c.json({ error: "이미 사용 중인 슬러그입니다. 다른 슬러그를 입력해주세요." }, 409);
      }
    }
  }

  if (!clerkOrg) return c.json({ error: "조직 생성에 실패했습니다." }, 500);

  const orgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  await db.batch([
    db.insert(organizations).values({
      id: orgId,
      clerk_org_id: clerkOrg.id,
      name,
      slug: clerkOrg.slug ?? finalSlug,
      owner_user_id: dbUser.id,
      is_default: false,
    }),
    db.insert(organizationMembers).values({
      id: memberId,
      organization_id: orgId,
      user_id: dbUser.id,
      role: "admin",
      invited_by: null,
    }),
    db
      .update(users)
      .set({ default_organization_id: orgId })
      .where(eq(users.id, dbUser.id)),
  ]);

  return c.json({ id: orgId, clerk_org_id: clerkOrg.id, slug: clerkOrg.slug ?? finalSlug }, 201);
});

// ─── GET /api/org/:id — 조직 단건 조회 ───────────────────────────────────────

app.get("/:id", async (c) => {
  const clerkUserId = getClerkUserId(c);
  if (!clerkUserId) return c.json({ error: "Unauthorized" }, 401);

  const orgId = c.req.param("id");
  const dbUser = await getDbUser(clerkUserId);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) return c.json({ error: "Not found" }, 404);

  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organization_id, orgId),
      eq(organizationMembers.user_id, dbUser.id)
    ),
  });
  if (!member) return c.json({ error: "Not found" }, 404);

  const [countRow] = await db
    .select({ cnt: count(organizationMembers.id) })
    .from(organizationMembers)
    .where(eq(organizationMembers.organization_id, orgId));

  return c.json({
    id: org.id,
    clerk_org_id: org.clerk_org_id,
    name: org.name,
    slug: org.slug,
    plan_product_id: org.plan_product_id,
    is_default: org.is_default,
    deleted_at: org.deleted_at,
    role: member.role,
    member_count: Number(countRow?.cnt ?? 0),
  });
});

// ─── PATCH /api/org/:id — 조직 설정 수정 (org:admin) ─────────────────────────

const patchOrgSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: z.string().min(1).max(48).optional(),
});

app.patch("/:id", withOrganization, withAdminRole, async (c) => {
  const orgCtx = c.get("orgCtx");

  const parsed = patchOrgSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const { name, slug } = parsed.data;

  const client = await clerkClient();
  if (name || slug) {
    await client.organizations.updateOrganization(orgCtx.org.clerk_org_id, {
      ...(name && { name }),
      ...(slug && { slug }),
    });
  }

  const [updated] = await db
    .update(organizations)
    .set({ ...(name && { name }), ...(slug && { slug }) })
    .where(eq(organizations.id, orgCtx.org.id))
    .returning();

  return c.json({ id: updated.id, name: updated.name, slug: updated.slug });
});

// ─── DELETE /api/org/:id — soft delete (UC-26, 30일 grace) ───────────────────

app.delete("/:id", withOrganization, withAdminRole, async (c) => {
  const { org, dbUserId } = c.get("orgCtx");

  if (org.is_default) {
    return c.json(
      { error: "Personal Org cannot be deleted", error_code: "PERSONAL_ORG_PROTECTED" },
      400
    );
  }

  await db
    .update(organizations)
    .set({ deleted_at: new Date() })
    .where(eq(organizations.id, org.id));

  // D-01: org 삭제 시 활성 구독에 org_deleted_at 마킹 + 빌링키 파기
  const [activeSub] = await db.select({ id: subscriptions.id, status: subscriptions.status })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.organization_id, org.id),
      isNotNull(subscriptions.billing_key_encrypted),
    ))
    .limit(1);

  if (activeSub) {
    await db.update(subscriptions).set({
      billing_key_encrypted: null,
      org_deleted_at: new Date(),
    }).where(eq(subscriptions.id, activeSub.id));

    await recordSubscriptionHistory({
      subscriptionId: activeSub.id,
      fromStatus: activeSub.status as SubscriptionStatus,
      toStatus: SUBSCRIPTION_STATUS.SUSPENDED,
      billingKeyChanged: true,
      changedBy: dbUserId,
      reason: SUBSCRIPTION_HISTORY_REASON.ORG_SOFT_DELETE,
    });
  }

  // 삭제된 조직이 활성 조직이었다면 Personal Org로 default 전환
  const personalOrg = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.owner_user_id, dbUserId),
      eq(organizations.is_default, true),
      isNull(organizations.deleted_at)
    ),
  });

  if (personalOrg) {
    await db
      .update(users)
      .set({ default_organization_id: personalOrg.id })
      .where(eq(users.id, dbUserId));
  }

  return c.json({
    deleted: true,
    restore_before: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
});

// ─── POST /api/org/:id/restore — 복원 (UC-27) ────────────────────────────────

app.post("/:id/restore", async (c) => {
  const clerkUserId = getClerkUserId(c);
  if (!clerkUserId) return c.json({ error: "Unauthorized" }, 401);

  const orgId = c.req.param("id");
  const dbUser = await getDbUser(clerkUserId);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org || org.deleted_at === null) {
    return c.json({ error: "Organization not found or not deleted" }, 404);
  }

  const gracePeriod = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - org.deleted_at.getTime() > gracePeriod) {
    return c.json({ error: "Grace period expired", error_code: "GRACE_EXPIRED" }, 404);
  }

  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organization_id, orgId),
      eq(organizationMembers.user_id, dbUser.id)
    ),
  });
  if (!member || member.role !== "admin") {
    return c.json({ error: "Admin role required" }, 403);
  }

  await db
    .update(organizations)
    .set({ deleted_at: null })
    .where(eq(organizations.id, orgId));

  // D-02: org 복원 시 구독 org_deleted_at 초기화 + 이력 기록
  const [deletedSub] = await db.select({ id: subscriptions.id, status: subscriptions.status })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.organization_id, orgId),
      isNotNull(subscriptions.org_deleted_at),
    ))
    .limit(1);

  if (deletedSub) {
    await db.update(subscriptions).set({ org_deleted_at: null })
      .where(eq(subscriptions.id, deletedSub.id));

    await recordSubscriptionHistory({
      subscriptionId: deletedSub.id,
      fromStatus: deletedSub.status as SubscriptionStatus,
      toStatus: deletedSub.status as SubscriptionStatus,
      changedBy: dbUser.id,
      reason: SUBSCRIPTION_HISTORY_REASON.ORG_RESTORE,
    });
  }

  return c.json({ restored: true });
});

// ─── GET /api/org/:id/members — 멤버 목록 ────────────────────────────────────

app.get("/:id/members", withOrganization, withAdminRole, async (c) => {
  const { org } = c.get("orgCtx");

  const members = await db
    .select({
      userId: users.id,
      email: users.email,
      role: organizationMembers.role,
      joined_at: organizationMembers.joined_at,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.user_id, users.id))
    .where(eq(organizationMembers.organization_id, org.id));

  const client = await clerkClient();
  const invitations = await client.organizations.getOrganizationInvitationList({
    organizationId: org.clerk_org_id,
    status: ["pending"],
  });

  return c.json({
    members,
    pending_invitations: invitations.data.map((inv) => ({
      invitation_id: inv.id,
      email: inv.emailAddress,
      role: inv.role.replace("org:", ""),
      expires_at: new Date(inv.createdAt + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })),
  });
});

// ─── POST /api/org/:id/members/invitations — 초대 발송 (UC-24) ───────────────

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

app.post("/:id/members/invitations", withOrganization, withAdminRole, async (c) => {
  const { org } = c.get("orgCtx");

  // F-01/F-02: validateInviteCapacity로 통합 검증 (personal, free, max_members 포함)
  const capacity = await validateInviteCapacity(org.id);
  if (!capacity.allowed) {
    const statusCode = capacity.code === "MEMBER_LIMIT_REACHED" ? 409 : 400;
    return c.json({ error: capacity.code ?? "INVITE_NOT_ALLOWED", error_code: capacity.code }, statusCode);
  }

  const parsed = inviteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const { email, role } = parsed.data;

  const client = await clerkClient();
  const invitation = await client.organizations.createOrganizationInvitation({
    organizationId: org.clerk_org_id,
    emailAddress: email,
    role: `org:${role}`,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/sign-in`,
  });

  return c.json(
    {
      invitation_id: invitation.id,
      status: "pending",
      expires_at: new Date(invitation.createdAt + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    201
  );
});

// ─── PATCH /api/org/:id/members/:userId — 역할 변경 (UC-25) ──────────────────

const patchMemberSchema = z.object({
  role: z.enum(["admin", "member"]),
});

app.patch("/:id/members/:userId", withOrganization, withAdminRole, async (c) => {
  const { org } = c.get("orgCtx");
  const targetUserId = c.req.param("userId");

  const parsed = patchMemberSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const { role } = parsed.data;

  // 마지막 admin 강등 차단 (UC-25 §5-3)
  if (role === "member") {
    const [adminCount] = await db
      .select({ cnt: count(organizationMembers.id) })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organization_id, org.id),
          eq(organizationMembers.role, "admin")
        )
      );

    if (Number(adminCount.cnt) <= 1) {
      return c.json(
        { error: "Cannot demote last admin", error_code: "LAST_ADMIN" },
        400
      );
    }
  }

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
  });
  if (!targetUser) return c.json({ error: "User not found" }, 404);

  const client = await clerkClient();
  await client.organizations.updateOrganizationMembership({
    organizationId: org.clerk_org_id,
    userId: targetUser.clerk_user_id,
    role: `org:${role}`,
  });

  await db
    .update(organizationMembers)
    .set({ role })
    .where(
      and(
        eq(organizationMembers.organization_id, org.id),
        eq(organizationMembers.user_id, targetUserId)
      )
    );

  return c.json({ user_id: targetUserId, role });
});

// ─── DELETE /api/org/:id/members/:userId — 멤버 제거 (UC-25) ─────────────────

app.delete("/:id/members/:userId", withOrganization, withAdminRole, async (c) => {
  const { org } = c.get("orgCtx");
  const targetUserId = c.req.param("userId");

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
  });
  if (!targetUser) return c.json({ error: "User not found" }, 404);

  const client = await clerkClient();
  await client.organizations.deleteOrganizationMembership({
    organizationId: org.clerk_org_id,
    userId: targetUser.clerk_user_id,
  });

  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organization_id, org.id),
        eq(organizationMembers.user_id, targetUserId)
      )
    );

  return c.json({ deleted: true });
});

// ─── POST /api/org/:id/leave — 팀 탈퇴 (E-04) ────────────────────────────────

app.post("/:id/leave", async (c) => {
  const clerkUserId = getClerkUserId(c);
  if (!clerkUserId) return c.json({ error: "Unauthorized" }, 401);

  const orgId = c.req.param("id");
  const dbUser = await getDbUser(clerkUserId);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  const org = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, orgId), isNull(organizations.deleted_at)),
  });
  if (!org) return c.json({ error: "Not found" }, 404);
  if (org.is_default) return c.json({ error: "Personal org cannot be left", error_code: "PERSONAL_ORG_PROTECTED" }, 400);

  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organization_id, orgId),
      eq(organizationMembers.user_id, dbUser.id),
    ),
  });
  if (!member) return c.json({ error: "Not a member" }, 404);

  // 마지막 admin 탈퇴 차단
  if (member.role === "admin") {
    const [otherAdmins] = await db
      .select({ cnt: count(organizationMembers.id) })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organization_id, orgId),
        eq(organizationMembers.role, "admin"),
        ne(organizationMembers.user_id, dbUser.id),
      ));

    if (Number(otherAdmins.cnt) === 0) {
      return c.json({ error: "Cannot leave as last admin", error_code: "LAST_ADMIN" }, 400);
    }
  }

  // Clerk 멤버십 제거 → webhook이 member_count 감소 + payer_warning 처리
  const client = await clerkClient();
  await client.organizations.deleteOrganizationMembership({
    organizationId: org.clerk_org_id,
    userId: clerkUserId,
  });

  // DB 즉시 반영 (webhook은 비동기이므로)
  await db.delete(organizationMembers).where(and(
    eq(organizationMembers.organization_id, orgId),
    eq(organizationMembers.user_id, dbUser.id),
  ));

  return c.json({ ok: true });
});

export default app;
