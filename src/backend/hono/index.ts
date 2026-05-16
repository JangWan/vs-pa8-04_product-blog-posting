import { Hono } from "hono";
import historyRoute from "@/features/history/backend/route";
import guidelinesRoute from "@/features/guidelines/backend/route";

let _app: Hono | null = null;

export function getHonoApp(): Hono {
  // 개발 환경에서는 HMR 반영을 위해 매번 재생성
  if (process.env.NODE_ENV === "development" || !_app) {
    _app = createApp();
  }
  return _app;
}

function createApp(): Hono {
  const app = new Hono().basePath("/api");
  app.route("/history", historyRoute);
  app.route("/guidelines", guidelinesRoute);
  return app;
}
