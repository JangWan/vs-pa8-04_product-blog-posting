import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { contentVersions, contents, guidelines, users } from "@/db/schema";
import { and, desc, eq, lt, sql } from "drizzle-orm";

const historyRoute = new Hono<{ Variables: { userId: string } }>();

/* GET /api/history?limit=N&cursor=<last_id> — 이력 목록 (커서 페이지네이션) */
historyRoute.get("/", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20") || 20, 100);
  const cursor = c.req.query("cursor") ?? null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ data: [], next_cursor: null });

  // 커서가 있으면 해당 id의 created_at 기준으로 그 이전 항목만 조회
  let beforeCreatedAt: Date | null = null;
  if (cursor) {
    const cursorRow = await db
      .select({ created_at: contents.created_at })
      .from(contents)
      .where(and(eq(contents.id, cursor), eq(contents.user_id, dbUser.id)))
      .limit(1);
    if (cursorRow.length > 0) beforeCreatedAt = cursorRow[0].created_at;
  }

  const whereExpr = beforeCreatedAt
    ? and(
        eq(contents.user_id, dbUser.id),
        lt(contents.created_at, beforeCreatedAt),
      )
    : eq(contents.user_id, dbUser.id);

  // limit + 1로 조회해서 다음 페이지 존재 여부 판단
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
  const id = c.req.param("id");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const rows = await db
    .select({
      id: contents.id,
      topic: contents.topic,
      keywords: contents.keywords,
      direction: contents.direction,
      body: contents.body,
      seo_meta: contents.seo_meta,
      source_lang: contents.source_lang,
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
  // BR-04: 타인 데이터 접근은 ID 노출 방지를 위해 404로 응답 (UC-15 §5-1)
  if (row.user_id !== dbUser.id) return c.json({ error: "Not found" }, 404);

  const { user_id: _omit, ...result } = row;
  return c.json(result);
});

const putBodySchema = z.object({ body: z.string().min(1) });

/* PUT /api/history/:id — 에디터 수동 저장 (BR-17 + BR-18 자동 스냅샷) */
historyRoute.put("/:id", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const id = c.req.param("id");

  const parsed = putBodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const { body } = parsed.data;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const existing = await db.query.contents.findFirst({
    where: and(eq(contents.id, id), eq(contents.user_id, dbUser.id)),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  /* BR-18: 본문이 실제로 바뀐 경우에만 직전 본문을 자동 스냅샷.
     동일 본문이면 스냅샷 생략(중복 방지). BR-20 초과 시 자동 스냅샷은 건너뛰고
     편집 자체는 허용 — 수동 스냅샷 시에만 명시적 400을 반환한다. */
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
  const id = c.req.param("id");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const existing = await db.query.contents.findFirst({
    where: and(eq(contents.id, id), eq(contents.user_id, dbUser.id)),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  await db.delete(contents).where(eq(contents.id, id));
  return c.json({ success: true });
});

export default historyRoute;
