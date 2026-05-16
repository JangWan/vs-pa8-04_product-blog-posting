import { getHonoApp } from "@/backend/hono";

const handler = (req: Request) => getHonoApp().fetch(req);

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
