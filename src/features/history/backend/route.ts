import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { contentVersions, contents, guidelines, organizations, users } from "@/db/schema";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Organization } from "@/db/schema";

type Bindings = { userId: string | null; orgId: string | null };

const historyRoute = new Hono<{
  Variables: { userId: string };
  Bindings: Bindings;
}>();

// ─── 헬퍼: 현재 활성 조직 조회 ───────────────────────────────────────────────

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

/* GET /api/history?limit=N&cursor=<last_id> — 이력 목록 (커서 페이지네이션) */
historyRoute.get("/", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20") || 20, 100);
  const cursor = c.req.query("cursor") ?? null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ data: [], next_cursor: null });

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  // 조직 스코프 필터 (백필 미완료 데이터 fallback 포함)
  const orgFilter = org
    ? or(
        eq(contents.organization_id, org.id),
        and(isNull(contents.organization_id), eq(contents.user_id, dbUser.id))
      )
    : eq(contents.user_id, dbUser.id);

  let beforeCreatedAt: Date | null = null;
  if (cursor) {
    const cursorRow = await db
      .select({ created_at: contents.created_at })
      .from(contents)
      .where(and(eq(contents.id, cursor), orgFilter))
      .limit(1);
    if (cursorRow.length > 0) beforeCreatedAt = cursorRow[0].created_at;
  }

  const whereExpr = beforeCreatedAt
    ? and(orgFilter, lt(contents.created_at, beforeCreatedAt))
    : orgFilter;

  const rows = await db
    .select({
      id: contents.id,
      topic: contents.topic,
      created_at: contents.created_at,
      updated_at: contents.updated_at,
      guideline_title: guidelines.title,
    })
    .from(contents)
    .leftJoin(guidelines, eq(contents.guideline_id, guidelines.id))
    .where(whereExpr)
    .orderBy(desc(contents.created_at))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const next_cursor = hasMore ? data[data.length - 1].id : null;

  return c.json({ data, next_cursor });
});

/* GET /api/history/:id — 이력 단건 조회 (에디터·상세용) */
historyRoute.get("/:id", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;
  const id = c.req.param("id");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  const rows = await db
    .select({
      id: contents.id,
      topic: contents.topic,
      keywords: contents.keywords,
      direction: contents.direction,
      body: contents.body,
      seo_meta: contents.seo_meta,
      source_lang: contents.source_lang,
      organization_id: contents.organization_id,
      created_at: contents.created_at,
      updated_at: contents.updated_at,
      guideline_title: guidelines.title,
      user_id: contents.user_id,
    })
    .from(contents)
    .leftJoin(guidelines, eq(contents.guideline_id, guidelines.id))
    .where(eq(contents.id, id))
    .limit(1);

  if (rows.length === 0) return c.json({ error: "Not found" }, 404);

  const row = rows[0];

  // 조직 소유권 검증 (BR-04: 타인 데이터 404)
  const belongsToOrg = org && row.organization_id === org.id;
  const belongsToUser = row.user_id === dbUser.id;
  if (!belongsToOrg && !belongsToUser) {
    return c.json({ error: "Not found" }, 404);
  }

  const { user_id: _omit, organization_id: _omit2, ...result } = row;
  return c.json(result);
});

const putBodySchema = z.object({ body: z.string().min(1) });

/* PUT /api/history/:id — 에디터 수동 저장 (BR-17 + BR-18 자동 스냅샷) */
historyRoute.put("/:id", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;
  const id = c.req.param("id");

  const parsed = putBodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const { body } = parsed.data;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  const existing = await db.query.contents.findFirst({
    where: eq(contents.id, id),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  // 소유권 검증
  const belongsToOrg = org && existing.organization_id === org.id;
  const belongsToUser = existing.user_id === dbUser.id;
  if (!belongsToOrg && !belongsToUser) {
    return c.json({ error: "Not found" }, 404);
  }

  /* BR-18: 본문이 실제로 바뀐 경우에만 직전 본문을 자동 스냅샷 */
  if (existing.body !== body) {
    const prevBytes = Buffer.byteLength(existing.body, "utf8");
    if (prevBytes <= 100 * 1024) {
      const maxRow = await db
        .select({ max: sql<number | null>`max(${contentVersions.version_no})` })
        .from(contentVersions)
        .where(eq(contentVersions.content_id, id));
      const nextNo = (maxRow[0]?.max ?? 0) + 1;

      await db.insert(contentVersions).values({
        id: crypto.randomUUID(),
        content_id: id,
        version_no: nextNo,
        snapshot_body: existing.body,
        snapshot_seo_meta: existing.seo_meta,
      });
    }
  }

  const updated = await db
    .update(contents)
    .set({ body, updated_at: new Date() })
    .where(eq(contents.id, id))
    .returning({ updated_at: contents.updated_at });

  return c.json({ updated_at: updated[0].updated_at });
});

/* DELETE /api/history/:id — 이력 삭제 (UC-15 §4-1, BR-24 CASCADE) */
historyRoute.delete("/:id", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const clerkOrgId = (c.env as Bindings).orgId;
  const id = c.req.param("id");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const org = await resolveOrg(dbUser.id, clerkOrgId);

  const existing = await db.query.contents.findFirst({
    where: eq(contents.id, id),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  const belongsToOrg = org && existing.organization_id === org.id;
  const belongsToUser = existing.user_id === dbUser.id;
  if (!belongsToOrg && !belongsToUser) {
    return c.json({ error: "Not found" }, 404);
  }

  await db.delete(contents).where(eq(contents.id, id));
  return c.json({ success: true });
});

export default historyRoute;
