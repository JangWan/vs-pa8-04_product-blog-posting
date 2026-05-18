import { createMiddleware } from "hono/factory";

/**
 * withOrganization 이후에 사용. member.role === 'admin' 검증.
 * UC-24~27, 멤버 초대·역할변경·삭제 등 admin 전용 액션에 적용.
 */
export const withAdminRole = createMiddleware(async (c, next) => {
  const orgCtx = c.get("orgCtx");

  if (!orgCtx) {
    return c.json({ error: "Organization context missing" }, 500);
  }

  if (orgCtx.member.role !== "admin") {
    return c.json(
      { error: "Admin role required", error_code: "FORBIDDEN" },
      403
    );
  }

  await next();
});
