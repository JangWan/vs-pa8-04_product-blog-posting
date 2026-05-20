import { Hono } from "hono";
import historyRoute from "@/features/history/backend/route";
import guidelinesRoute from "@/features/guidelines/backend/route";
import generateRoute from "@/features/generate/backend/route";
import contentsRoute from "@/features/content-versions/backend/route";
import translationsRoute from "@/features/translations/backend/route";
import orgRoute from "@/features/organizations/backend/route";
import billingRoute from "@/features/billing/backend/route";

let _app: Hono | null = null;

export function getHonoApp(): Hono {
  if (process.env.NODE_ENV === "development" || !_app) {
    _app = createApp();
  }
  return _app;
}

function createApp(): Hono {
  const app = new Hono().basePath("/api");
  app.route("/history", historyRoute);
  app.route("/guidelines", guidelinesRoute);
  app.route("/generate", generateRoute);
  app.route("/contents", contentsRoute);
  app.route("/contents", translationsRoute);
  app.route("/org", orgRoute);
  app.route("/billing", billingRoute);
  return app;
}
