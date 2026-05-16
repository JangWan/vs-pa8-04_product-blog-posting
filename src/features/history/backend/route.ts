import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { contents, guidelines, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

const historyRoute = new Hono<{ Variables: { userId: string } }>();

/* GET /api/history?limit=N — 이력 목록 */
historyRoute.get("/", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 100);

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ data: [], next_cursor: null });

  const items = await db
    .select({
      id: contents.id,
      topic: contents.topic,
      created_at: contents.created_at,
      updated_at: contents.updated_at,
      guideline_title: guidelines.title,
    })
    .from(contents)
    .leftJoin(guidelines, eq(contents.guideline_id, guidelines.id))
    .where(eq(contents.user_id, dbUser.id))
    .orderBy(desc(contents.created_at))
    .limit(limit);

  return c.json({ data: items, next_cursor: null });
});

/* GET /api/history/:id — 이력 단건 조회 (에디터용) */
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
  if (row.user_id !== dbUser.id) return c.json({ error: "Forbidden" }, 403);

  const { user_id: _, ...result } = row;
  return c.json(result);
});

const putBodySchema = z.object({ body: z.string().min(1) });

/* PUT /api/history/:id — 에디터 수동 저장 */
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

  const updated = await db
    .update(contents)
    .set({ body, updated_at: new Date() })
    .where(eq(contents.id, id))
    .returning({ updated_at: contents.updated_at });

  return c.json({ updated_at: updated[0].updated_at });
});

export default historyRoute;
