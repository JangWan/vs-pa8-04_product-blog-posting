import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { guidelines, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

const guidelinesRoute = new Hono<{ Variables: { userId: string } }>();

const guidelineSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
  is_default: z.boolean().optional().default(false),
});

/* GET /api/guidelines — 지침 목록 */
guidelinesRoute.get("/", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json([]);

  const items = await db
    .select()
    .from(guidelines)
    .where(eq(guidelines.user_id, dbUser.id))
    .orderBy(desc(guidelines.created_at));

  return c.json(items);
});

/* GET /api/guidelines/:id — 지침 단건 */
guidelinesRoute.get("/:id", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");
  const id = c.req.param("id");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const item = await db.query.guidelines.findFirst({
    where: and(eq(guidelines.id, id), eq(guidelines.user_id, dbUser.id)),
  });
  if (!item) return c.json({ error: "Not found" }, 404);

  return c.json(item);
});

/* POST /api/guidelines — 지침 생성 */
guidelinesRoute.post("/", requireAuth, async (c) => {
  const clerkUserId = c.get("userId");

  const parsed = guidelineSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const data = parsed.data;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  /* is_default=true 설정 시 기존 기본 지침 해제 (BR-11: 단일 기본 지침) */
  if (data.is_default) {
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
  const id = c.req.param("id");

  const parsed = guidelineSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const data = parsed.data;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const existing = await db.query.guidelines.findFirst({
    where: and(eq(guidelines.id, id), eq(guidelines.user_id, dbUser.id)),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  if (data.is_default) {
    await db
      .update(guidelines)
      .set({ is_default: false })
      .where(eq(guidelines.user_id, dbUser.id));
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
  const id = c.req.param("id");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_user_id, clerkUserId),
  });
  if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

  const existing = await db.query.guidelines.findFirst({
    where: and(eq(guidelines.id, id), eq(guidelines.user_id, dbUser.id)),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  await db.delete(guidelines).where(eq(guidelines.id, id));
  return c.json({ success: true });
});

export default guidelinesRoute;
