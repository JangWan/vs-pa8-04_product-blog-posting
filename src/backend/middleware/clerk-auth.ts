import { createMiddleware } from "hono/factory";
import { auth } from "@clerk/nextjs/server";

type Variables = { userId: string };

export const requireAuth = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const { userId } = await auth();
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  }
);
