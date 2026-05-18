import { createMiddleware } from "hono/factory";
import { db } from "@/db";
import { organizations, organizationMembers, users } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { Organization, OrganizationMember } from "@/db/schema";

export type OrgContext = {
  org: Organization;
  member: OrganizationMember;
  dbUserId: string;
  clerkUserId: string;
};

type Env = {
  Variables: { orgCtx: OrgContext };
  Bindings: { userId: string | null; orgId: string | null };
};

declare module "hono" {
  interface ContextVariableMap {
    orgCtx: OrgContext;
  }
}

/**
 * env.orgId(Clerk 활성 조직) → DB 조회 → c.set('orgCtx')
 * orgId 없으면 users.default_organization_id fallback
 */
export const withOrganization = createMiddleware<Env>(async (c, next) => {
  const clerkUserId = (c.env as { userId?: string | null })?.userId;
  const clerkOrgId = (c.env as { orgId?: string | null })?.orgId;

  if (!clerkUserId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // 우선순위: URL :id 파라미터 → clerkOrgId → default_organization_id fallback
  // /api/org/:id/members 같은 라우트에서 URL id가 DB org UUID임
  let org: Organization | undefined;

  const urlOrgId = c.req.param("id");
  if (urlOrgId) {
    org = await db.query.organizations.findFirst({
      where: eq(organizations.id, urlOrgId),
    });
  }

  if (!org && clerkOrgId) {
    org = await db.query.organizations.findFirst({
      where: eq(organizations.clerk_org_id, clerkOrgId),
    });
  }

  if (!org && dbUser.default_organization_id) {
    org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, dbUser.default_organization_id),
        isNull(organizations.deleted_at)
      ),
    });
  }

  if (!org) {
    return c.json({ error: "Active organization not found" }, 404);
  }

  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organization_id, org.id),
      eq(organizationMembers.user_id, dbUser.id)
    ),
  });

  if (!member) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  c.set("orgCtx", {
    org,
    member,
    dbUserId: dbUser.id,
    clerkUserId,
  });
  await next();
});
