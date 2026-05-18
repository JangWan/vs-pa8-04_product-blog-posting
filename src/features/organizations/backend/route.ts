import { Hono } from "hono";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/db";
import { organizations, organizationMembers, users } from "@/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";
import { withOrganization } from "../middleware/with-organization";
import { withAdminRole } from "../middleware/with-admin-role";

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

  const memberships = await db
    .select({ org: organizations, member: organizationMembers })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organization_id, organizations.id))
    .where(eq(organizationMembers.user_id, dbUser.id));

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
    plan: org.plan,
    is_personal: org.is_personal,
    deleted_at: org.deleted_at,
    role: member.role,
    member_count: countMap.get(org.id) ?? 0,
    is_default: org.id === dbUser.default_organization_id,
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
      plan: "free",
      is_personal: false,
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
    plan: org.plan,
    is_personal: org.is_personal,
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

  if (org.is_personal) {
    return c.json(
      { error: "Personal Org cannot be deleted", error_code: "PERSONAL_ORG_PROTECTED" },
      400
    );
  }

  await db
    .update(organizations)
    .set({ deleted_at: new Date() })
    .where(eq(organizations.id, org.id));

  // 삭제된 조직이 활성 조직이었다면 Personal Org로 default 전환
  const personalOrg = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.owner_user_id, dbUserId),
      eq(organizations.is_personal, true),
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

  if (org.is_personal) {
    return c.json(
      { error: "Personal Org cannot have members", error_code: "PERSONAL_ORG_PROTECTED" },
      400
    );
  }

  // 멤버 한도 체크 (BR-32: Free=1, Pro=3)
  const maxMembers = org.plan === "pro" ? 3 : 1;
  const [countRow] = await db
    .select({ cnt: count(organizationMembers.id) })
    .from(organizationMembers)
    .where(eq(organizationMembers.organization_id, org.id));

  if (Number(countRow.cnt) >= maxMembers) {
    return c.json(
      {
        error: `Member limit reached (${maxMembers})`,
        error_code: "MEMBER_LIMIT_EXCEEDED",
        current_plan: org.plan,
        max_members: maxMembers,
      },
      409
    );
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

export default app;
