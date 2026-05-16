import { Hono } from "hono";
import { requireAuth } from "@/backend/middleware/clerk-auth";
import { db } from "@/db";
import { guidelines, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const guidelinesRoute = new Hono<{ Variables: { userId: string } }>();

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

export default guidelinesRoute;
