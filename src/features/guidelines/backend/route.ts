import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { guidelines, organizations, organizationMembers, users } from "@/db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { Organization } from "@/db/schema";

type Bindings = { userId: string | null; orgId: string | null };

const guidelinesRoute = new Hono<{
  Variables: { userId: string };
  Bindings: Bindings;
}>();

const guidelineSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
  is_default: z.boolean().optional().default(false),
});

// ─── 헬퍼: 현재 활성 조직 조회 ───────────────────────────────────────────────
// clerkOrgId → DB 조회, 없으면 default_organization_id fallback

async function resolveOrg(
  dbUserId: string,
  clerkOrgId: string | null | undefined
): Promise<Organization | null> {
  if (clerkOrgId) {
    const org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.clerk_org_id, clerkOrgId),
        isNull(organizations.deleted_at)
      ),
    });
    if (org) return org;
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, dbUserId),
  });
  if (!dbUser?.default_organization_id) return null;

  const fallback = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.id, dbUser.default_organization_id),
      isNull(organizations.deleted_at)
    ),
  });
  return fallback ?? null;
}

/* GET /api/guidelines — 지침 목록 (조직 공용, BR-34) */
guidelinesRoute.get("/", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json([]);

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  // 조직이 있으면 organization_id로 조회, 없으면 기존 user_id 기반 조회 (백필 전 fallback)
  const items = org
    ? await db
        .select()
        .from(guidelines)
        .where(
          or(
            eq(guidelines.organization_id, org.id),
            // 백필 미완료 데이터: organization_id가 null이고 user_id가 일치하는 것도 포함
            and(isNull(guidelines.organization_id), eq(guidelines.user_id, dbUser.id))
          )
        )
        .orderBy(desc(guidelines.created_at))
    : await db
        .select()
        .from(guidelines)
        .where(eq(guidelines.user_id, dbUser.id))
        .orderBy(desc(guidelines.created_at));

  return c.json(items);
});

/* GET /api/guidelines/:id — 지침 단건 */
guidelinesRoute.get("/:id", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;
  const id = c.req.param("id");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  const item = org
    ? await db.query.guidelines.findFirst({
        where: and(
          eq(guidelines.id, id),
          or(
            eq(guidelines.organization_id, org.id),
            and(isNull(guidelines.organization_id), eq(guidelines.user_id, dbUser.id))
          )
        ),
      })
    : await db.query.guidelines.findFirst({
        where: and(eq(guidelines.id, id), eq(guidelines.user_id, dbUser.id)),
      });

  if (!item) return c.json({ error: "Not found" }, 404);

  return c.json(item);
});

/* POST /api/guidelines — 지침 생성 */
guidelinesRoute.post("/", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;

  const parsed = guidelineSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const data = parsed.data;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  /* is_default=true 설정 시 기존 기본 지침 해제 (BR-11: 단일 기본 지침) */
  if (data.is_default && org) {
    await db
      .update(guidelines)
      .set({ is_default: false })
      .where(eq(guidelines.organization_id, org.id));
  } else if (data.is_default) {
    await db
      .update(guidelines)
      .set({ is_default: false })
      .where(eq(guidelines.user_id, dbUser.id));
  }

  const [created] = await db
    .insert(guidelines)
    .values({
      id: crypto.randomUUID(),
      user_id: dbUser.id,
      organization_id: org?.id ?? null,
      created_by: dbUser.id,
      title: data.title,
      content: data.content,
      is_default: data.is_default,
    })
    .returning();

  return c.json(created, 201);
});

/* PUT /api/guidelines/:id — 지침 수정 */
guidelinesRoute.put("/:id", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;
  const id = c.req.param("id");

  const parsed = guidelineSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const data = parsed.data;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  // 조직 소유권 or 기존 user 소유권 검증
  const existing = org
    ? await db.query.guidelines.findFirst({
        where: and(
          eq(guidelines.id, id),
          or(
            eq(guidelines.organization_id, org.id),
            and(isNull(guidelines.organization_id), eq(guidelines.user_id, dbUser.id))
          )
        ),
      })
    : await db.query.guidelines.findFirst({
        where: and(eq(guidelines.id, id), eq(guidelines.user_id, dbUser.id)),
      });

  if (!existing) return c.json({ error: "Not found" }, 404);

  if (data.is_default) {
    if (org) {
      await db
        .update(guidelines)
        .set({ is_default: false })
        .where(eq(guidelines.organization_id, org.id));
    } else {
      await db
        .update(guidelines)
        .set({ is_default: false })
        .where(eq(guidelines.user_id, dbUser.id));
    }
  }

  const [updated] = await db
    .update(guidelines)
    .set({ ...data, updated_at: new Date() })
    .where(eq(guidelines.id, id))
    .returning();

  return c.json(updated);
});

/* DELETE /api/guidelines/:id — 지침 삭제 */
guidelinesRoute.delete("/:id", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;
  const id = c.req.param("id");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  // org:admin만 삭제 가능 (BR-34)
  if (org) {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organization_id, org.id),
        eq(organizationMembers.user_id, dbUser.id)
      ),
    });
    if (!membership || membership.role !== "admin") {
      return c.json({ error: "Admin role required" }, 403);
    }
  }

  const existing = org
    ? await db.query.guidelines.findFirst({
        where: and(
          eq(guidelines.id, id),
          or(
            eq(guidelines.organization_id, org.id),
            and(isNull(guidelines.organization_id), eq(guidelines.user_id, dbUser.id))
          )
        ),
      })
    : await db.query.guidelines.findFirst({
        where: and(eq(guidelines.id, id), eq(guidelines.user_id, dbUser.id)),
      });

  if (!existing) return c.json({ error: "Not found" }, 404);

  await db.delete(guidelines).where(eq(guidelines.id, id));
  return c.json({ success: true });
});

export default guidelinesRoute;
