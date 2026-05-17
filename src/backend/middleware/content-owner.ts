import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contents, users } from "@/db/schema";

type Vars = { userId: string; dbUserId: string };

/* /api/contents/:id/** 라우트의 소유권 검증.
   타인 콘텐츠는 ID 노출 방지를 위해 403 대신 404로 응답 (BR-04). */
export const requireContentOwner = createMiddleware<{ Variables: Vars }>(
  async (c, next) => {
    const clerkUserId = c.get("userId");
    const contentId = c.req.param("id");
    if (!contentId) return c.json({ error: "Not found" }, 404);

    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerk_user_id, clerkUserId),
    });
    if (!dbUser) return c.json({ error: "Unauthorized" }, 401);

    const owns = await db
      .select({ id: contents.id })
      .from(contents)
      .where(
        and(eq(contents.id, contentId), eq(contents.user_id, dbUser.id)),
      )
      .limit(1);
    if (owns.length === 0) return c.json({ error: "Not found" }, 404);

    c.set("dbUserId", dbUser.id);
    await next();
  },
);
