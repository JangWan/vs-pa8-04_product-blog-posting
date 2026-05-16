import { auth } from "@clerk/nextjs/server";
import { getHonoApp } from "@/backend/hono";

// Clerk auth()는 Next.js AsyncLocalStorage 컨텍스트에서만 동작한다.
// Request 복제 없이 fetch() 두 번째 인자(env)로 userId를 Hono에 전달한다.
const handler = async (req: Request) => {
  const { userId } = await auth();
  return getHonoApp().fetch(req, { userId: userId ?? null });
};

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
