import { Hono } from "hono";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { contents, guidelines, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const historyRoute = new Hono<{ Variables: { userId: string } }>();

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

export default historyRoute;
