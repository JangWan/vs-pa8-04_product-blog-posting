import { createMiddleware } from "hono/factory";

type Variables = { userId: string };

// route.ts에서 fetch(req, { userId }) 두 번째 인자로 전달된 값을 c.env로 수신한다.
export const requireAuth = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const userId = (c.env as { userId?: string | null } | undefined)?.userId;
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  }
);
