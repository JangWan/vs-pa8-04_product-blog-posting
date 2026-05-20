import { Hono } from "hono";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  paymentCancelRequests,
  subscriptions,
  subscriptionHistory,
  organizations,
  planProducts,
  usageQuotas,
  users,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  issueBillingKeyAndCharge,
  updateBillingKey,
  cancelSubscriptionImmediate,
  syncTossPaymentStatus,
  calculateRefundAmount,
  updateOrderStatus,
  getOrCreateCustomerKey,
  upgradeSubscription,
  scheduleDowngrade,
  cancelScheduledDowngrade,
  recordSubscriptionHistory,
  resolveEffectiveLimits,
} from "./service";
import {
  ORDER_STATUS,
  ORDER_KIND,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_HISTORY_REASON,
  CLIENT_TRANSITION_STATUSES,
  PLAN_CODE,
  type OrderStatus,
  type SubscriptionStatus,
} from "./constants";

type Bindings = { userId: string | null; orgId: string | null };

const app = new Hono<{ Bindings: Bindings }>();

// ── 인증 + 조직 + admin 역할 검증 헬퍼 ──
async function resolveAdminContext(c: { env: Bindings }) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const [user] = await db.select().from(users).where(eq(users.clerk_user_id, clerkUserId));
  if (!user) return null;

  const { orgId: clerkOrgId, orgRole } = await auth();
  if (!clerkOrgId) return null;

  const [org] = await db.select().from(organizations)
    .where(eq(organizations.clerk_org_id, clerkOrgId));
  if (!org || org.deleted_at) return null;
  if (orgRole !== "org:admin") return null;

  return { user, org };
}

// ── GET /api/billing/plans — 플랜 카탈로그 (DB 기반, /plan-products와 동일 소스) ──
app.get("/plans", async (c) => {
  const products = await db.select().from(planProducts)
    .where(eq(planProducts.is_active, true));
  return c.json({ plans: products });
});

// ── C-7b: GET /api/billing/plan-products — DB 기반 플랜 상품 목록 (공개) ──
app.get("/plan-products", async (c) => {
  const products = await db.select().from(planProducts)
    .where(eq(planProducts.is_active, true));
  return c.json({ plan_products: products });
});

// ── GET /api/billing/subscription — 현재 구독 상태 ──
app.get("/subscription", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.organization_id, ctx.org.id))
    .orderBy(desc(subscriptions.created_at))
    .limit(1);

  // card_display: "카드사 ••••1234" 형식
  const cardDisplay = sub?.card_last4
    ? `${sub.card_company ?? ""}••••${sub.card_last4}`.trim()
    : null;

  // Phase 6: current_plan은 plan_product_id → plan_products JOIN으로 조회
  let currentPlanCode = PLAN_CODE.FREE as string;
  if (ctx.org.plan_product_id) {
    const [prod] = await db.select({ plan_code: planProducts.plan_code })
      .from(planProducts).where(eq(planProducts.id, ctx.org.plan_product_id));
    currentPlanCode = prod?.plan_code ?? PLAN_CODE.FREE;
  }

  return c.json({
    subscription: sub ?? null,
    card_display: cardDisplay,
    current_plan: currentPlanCode,
    plan_product_id: ctx.org.plan_product_id,
    is_default: ctx.org.is_default,
    statuses: SUBSCRIPTION_STATUS,
  });
});

// ── GET /api/billing/usage — 이번 달 사용량 ──
app.get("/usage", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [usage] = await db.select().from(usageQuotas)
    .where(and(
      eq(usageQuotas.organization_id, ctx.org.id),
      eq(usageQuotas.period_month, periodMonth)
    ));

  // G-01: override_* 포함한 실질 한도 (Pro→MAX 업그레이드 기간 등 반영)
  const effectiveLimits = await resolveEffectiveLimits(ctx.org.id);

  return c.json({
    period_month: periodMonth,
    usage: usage ?? { generations_used: 0, translations_used: 0, agent_runs_used: 0 },
    limits: {
      generations: effectiveLimits.generations_per_month,
      translations: effectiveLimits.translations_per_month,
      agent_runs: effectiveLimits.agent_runs_per_month,
    },
  });
});

// ── POST /api/billing/orders — 주문 생성 (UC-28 §3) ──
// C-08: is_default 분기 getOrCreateCustomerKey 사용
const createOrderSchema = z.object({
  plan: z.enum(["pro", "max"]),
  kind: z.enum(["new_subscription"]),
});

app.post("/orders", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const parsed = createOrderSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);

  const { plan, kind } = parsed.data;
  void kind; // kind는 스키마 검증용 (현재 new_subscription 고정)

  // Phase 6: PLANS 상수 대신 plan_products DB 조회
  const teamType = ctx.org.is_default ? "personal" : "team";
  const [planProduct] = await db.select({
    id: planProducts.id,
    price: planProducts.price,
    name: planProducts.name,
  }).from(planProducts).where(and(
    eq(planProducts.plan_code, plan),
    eq(planProducts.team_type, teamType),
    eq(planProducts.is_active, true),
  ));
  if (!planProduct) return c.json({ error: "PLAN_NOT_FOUND" }, 400);

  const customerKey = await getOrCreateCustomerKey(ctx.org.id);

  const orderId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  await db.batch([
    db.insert(orders).values({
      id: orderId,
      organization_id: ctx.org.id,
      kind: ORDER_KIND.NEW_SUBSCRIPTION,
      status: ORDER_STATUS.ORDER,
      total_amount: String(planProduct.price),
      expires_at: expiresAt,
      source: "user",
    }),
    db.insert(orderItems).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      plan_product_id: planProduct.id,
      quantity: 1,
      unit_price: String(planProduct.price),
      period_months: 1,
    }),
    db.insert(orderStatusHistory).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      from_status: null,
      to_status: ORDER_STATUS.ORDER,
      changed_by: ctx.user.id,
      reason: "order_created",
    }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return c.json({
    orderId,
    customerKey,
    amount: Number(planProduct.price),
    orderName: `IndiePost AI ${planProduct.name} 플랜`,
    successUrl: `${appUrl}/billing/checkout/result`,
    failUrl: `${appUrl}/billing/checkout/result`,
  });
});

// ── DELETE /api/billing/orders/:orderId — ORDER 상태 주문 삭제 ──
app.delete("/orders/:orderId", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const orderId = c.req.param("orderId");
  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.organization_id, ctx.org.id)));

  if (!order) return c.json({ error: "주문을 찾을 수 없습니다." }, 404);
  if (order.status !== ORDER_STATUS.ORDER) {
    return c.json({ error: "ORDER 상태인 주문만 삭제할 수 있습니다." }, 400);
  }

  await db.delete(orders).where(eq(orders.id, orderId));
  return c.json({ ok: true });
});

// ── PATCH /api/billing/orders/:orderId/status — AUTH_* 상태 전환 ──
const updateStatusSchema = z.object({
  status: z.enum(["AUTH_READY", "AUTH_SUCCESS", "AUTH_CANCEL", "AUTH_FAIL"]),
  reason: z.string().optional(),
});

app.patch("/orders/:orderId/status", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const orderId = c.req.param("orderId");
  const parsed = updateStatusSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);

  const { status, reason } = parsed.data;

  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.organization_id, ctx.org.id)));
  if (!order) return c.json({ error: "주문을 찾을 수 없습니다." }, 404);

  if (!CLIENT_TRANSITION_STATUSES.includes(status as OrderStatus)) {
    return c.json({ error: "허용되지 않는 상태 전환입니다." }, 400);
  }

  await updateOrderStatus(orderId, status as OrderStatus, ctx.user.id, reason, order.status);
  return c.json({ ok: true, status });
});

// ── POST /api/billing/orders/:orderId/activate — UC-28 빌링키 발급 + 즉시 결제 ──
// requestBillingAuth successUrl에서 받은 authKey + customerKey로 처리
const activateSchema = z.object({
  authKey: z.string().min(1),
  customerKey: z.string().min(1),
});

app.post("/orders/:orderId/activate", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const orderId = c.req.param("orderId");
  const parsed = activateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);

  // 주문 종류 조회: payment_method_update는 빌링키 교체만, 나머지는 즉시결제
  const [order] = await db.select({ kind: orders.kind }).from(orders).where(eq(orders.id, orderId));
  if (!order) return c.json({ error: "ORDER_NOT_FOUND" }, 404);

  if (order.kind === ORDER_KIND.PAYMENT_METHOD_UPDATE) {
    const result = await updateBillingKey(
      parsed.data.authKey,
      parsed.data.customerKey,
      orderId,
      ctx.user.id
    );

    if (!result.success) {
      const statusCode = result.code === "ORDER_NOT_FOUND" ? 404
        : result.code === "INVALID_ORDER_STATUS" ? 400
        : result.code === "NO_SUBSCRIPTION" ? 404
        : 500;
      return c.json({ error: result.code }, statusCode);
    }

    return c.json({ ok: true, status: ORDER_STATUS.PAY_SUCCESS, data: null });
  }

  // 신규 구독 / 플랜 변경: 빌링키 발급 + 즉시 1회차 결제
  const result = await issueBillingKeyAndCharge(
    parsed.data.authKey,
    parsed.data.customerKey,
    orderId,
    ctx.user.id
  );

  if (!result.success) {
    const statusCode = result.code === "ORDER_NOT_FOUND" ? 404
      : result.code === "INVALID_ORDER_STATUS" ? 400
      : 500;
    return c.json({ error: result.code }, statusCode);
  }

  return c.json({ ok: true, status: result.status, paymentKey: result.paymentKey, data: result.data });
});

// ── POST /api/billing/orders/:orderId/sync — 폴백 동기화 ──
app.post("/orders/:orderId/sync", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const orderId = c.req.param("orderId");
  const status = await syncTossPaymentStatus(orderId);
  return c.json({ ok: true, status });
});

// ── POST /api/billing/subscription/cancel — UC-31 해지 예약 ──
app.post("/subscription/cancel", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.organization_id, ctx.org.id))
    .orderBy(desc(subscriptions.created_at))
    .limit(1);

  if (!sub || sub.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return c.json({ error: "활성 구독이 없습니다." }, 400);
  }

  await db.update(subscriptions).set({
    status: SUBSCRIPTION_STATUS.CANCEL_SCHEDULED,
    cancel_scheduled_at: new Date(),
    next_billing_at: null,
  }).where(eq(subscriptions.id, sub.id));

  await recordSubscriptionHistory({
    subscriptionId: sub.id,
    fromStatus: SUBSCRIPTION_STATUS.ACTIVE,
    toStatus: SUBSCRIPTION_STATUS.CANCEL_SCHEDULED,
    fromPayerUserId: sub.payer_user_id,
    changedBy: ctx.user.id,
    reason: SUBSCRIPTION_HISTORY_REASON.CANCEL_SCHEDULED,
  });

  return c.json({ ok: true, current_period_end: sub.current_period_end });
});

// ── POST /api/billing/subscription/cancel-immediate — 서비스 미사용 즉시 환불 취소 ──
app.post("/subscription/cancel-immediate", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.organization_id, ctx.org.id))
    .orderBy(desc(subscriptions.created_at))
    .limit(1);

  if (!sub || sub.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return c.json({ error: "활성 구독이 없습니다." }, 400);
  }

  // 현재 달 usage 확인 (모두 0이어야 즉시 취소 허용)
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [usage] = await db.select().from(usageQuotas)
    .where(and(
      eq(usageQuotas.organization_id, ctx.org.id),
      eq(usageQuotas.period_month, periodMonth)
    ));

  const hasUsage = usage && (
    usage.generations_used > 0 ||
    usage.translations_used > 0 ||
    usage.agent_runs_used > 0
  );

  if (hasUsage) {
    return c.json({ error: "서비스를 이미 사용한 경우 즉시 취소가 불가합니다." }, 400);
  }

  const result = await cancelSubscriptionImmediate(ctx.org.id);

  if (!result.success) {
    const statusCode = result.code === "NO_PAID_ORDER" ? 404
      : result.code === "TOSS_CANCEL_FAILED" ? 502
      : 500;
    return c.json({ error: result.code }, statusCode);
  }

  return c.json({ ok: true });
});

// ── DELETE /api/billing/subscription/cancel — UC-38 해지 예약 취소 ──
app.delete("/subscription/cancel", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.organization_id, ctx.org.id))
    .orderBy(desc(subscriptions.created_at))
    .limit(1);

  if (!sub || sub.status !== SUBSCRIPTION_STATUS.CANCEL_SCHEDULED) {
    return c.json({ error: "NO_CANCEL_SCHEDULED" }, 400);
  }

  const now = new Date();
  if (!sub.current_period_end || new Date(sub.current_period_end) <= now) {
    return c.json({ error: "CANCEL_ALREADY_FINALIZED" }, 409);
  }

  // next_billing_at = current_period_end + 1일 (UC-38 경합 방어)
  const periodEndPlus1d = new Date(sub.current_period_end);
  periodEndPlus1d.setDate(periodEndPlus1d.getDate() + 1);
  const nowPlus1h = new Date(now.getTime() + 60 * 60 * 1000);
  const newNextBilling = periodEndPlus1d > nowPlus1h ? periodEndPlus1d : nowPlus1h;

  await db.update(subscriptions).set({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    cancel_scheduled_at: null,
    next_billing_at: newNextBilling,
  }).where(eq(subscriptions.id, sub.id));

  await recordSubscriptionHistory({
    subscriptionId: sub.id,
    fromStatus: SUBSCRIPTION_STATUS.CANCEL_SCHEDULED,
    toStatus: SUBSCRIPTION_STATUS.ACTIVE,
    fromPayerUserId: sub.payer_user_id,
    changedBy: ctx.user.id,
    reason: SUBSCRIPTION_HISTORY_REASON.CANCEL_SCHEDULED,
  });

  return c.json({ ok: true });
});

// ── C-09: POST /api/billing/subscription/payment-method/init ──
// Suspended 구독의 결제 수단 재등록 — 새 Toss 빌링 인증 시작
app.post("/subscription/payment-method/init", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.organization_id, ctx.org.id))
    .orderBy(desc(subscriptions.created_at))
    .limit(1);

  if (!sub) return c.json({ error: "NO_SUBSCRIPTION" }, 404);
  // 결제 수단 변경: SUSPENDED / ACTIVE / PAST_DUE 모두 허용 (Phase 5)
  const allowedStatuses: string[] = [
    SUBSCRIPTION_STATUS.SUSPENDED,
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.PAST_DUE,
  ];
  if (!allowedStatuses.includes(sub.status)) {
    return c.json({ error: "결제 수단을 변경할 수 없는 구독 상태입니다." }, 400);
  }

  const customerKey = await getOrCreateCustomerKey(ctx.org.id);

  // 결제 수단 업데이트용 주문 생성 (결제 없음, 빌링키만 교체)
  const orderId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  await db.batch([
    db.insert(orders).values({
      id: orderId,
      organization_id: ctx.org.id,
      subscription_id: sub.id,
      kind: ORDER_KIND.PAYMENT_METHOD_UPDATE,
      status: ORDER_STATUS.ORDER,
      total_amount: "0",
      expires_at: expiresAt,
    }),
    db.insert(orderStatusHistory).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      to_status: ORDER_STATUS.ORDER,
      changed_by: ctx.user.id,
      reason: "payment_method_update_init",
    }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return c.json({
    orderId,
    customerKey,
    successUrl: `${appUrl}/billing/payment-method/result`,
    failUrl: `${appUrl}/billing/payment-method/result`,
  });
});

// ── C-11: POST /api/billing/subscription/upgrade — Pro→MAX 업그레이드 ──
app.post("/subscription/upgrade", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const result = await upgradeSubscription(ctx.org.id, ctx.user.id);

  if (!result.success) {
    const statusCode = result.code === "NO_ACTIVE_PRO_SUBSCRIPTION" ? 400
      : result.code === "NO_BILLING_KEY" ? 422
      : result.code === "NO_REMAINING_DAYS" ? 400
      : result.code === "UPGRADE_CHARGE_FAILED" ? 502
      : 500;
    return c.json({ error: result.code }, statusCode);
  }

  return c.json({ ok: true, charged_amount: result.chargedAmount });
});

// ── C-12: POST /api/billing/subscription/downgrade — MAX→Pro 다음 주기 예약 ──
app.post("/subscription/downgrade", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const result = await scheduleDowngrade(ctx.org.id, ctx.user.id);

  if (!result.success) {
    return c.json({ error: result.code }, 400);
  }

  return c.json({ ok: true });
});

// ── C-14: DELETE /api/billing/subscription/downgrade — 다운그레이드 예약 취소 ──
app.delete("/subscription/downgrade", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const result = await cancelScheduledDowngrade(ctx.org.id, ctx.user.id);

  if (!result.success) {
    return c.json({ error: result.code }, 400);
  }

  return c.json({ ok: true });
});

// ── GET /api/billing/payments — 결제 이력 (D-4: order_kind + plan_code JOIN 포함) ──
app.get("/payments", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const orgOrderIds = (await db.select({ id: orders.id })
    .from(orders).where(eq(orders.organization_id, ctx.org.id)))
    .map((o) => o.id);

  if (orgOrderIds.length === 0) return c.json({ payments: [], next_cursor: null });

  // Phase 6: orderItems.plan_code 제거 → planProducts JOIN으로 plan_code 조회
  const paymentsResult = await db
    .select({
      id: payments.id,
      payment_key: payments.payment_key,
      order_id: payments.order_id,
      method: payments.method,
      status: payments.status,
      amount: payments.amount,
      balance_amount: payments.balance_amount,
      approved_at: payments.approved_at,
      raw_data: payments.raw_data,
      created_at: payments.created_at,
      updated_at: payments.updated_at,
      order_kind: orders.kind,
      plan_code: planProducts.plan_code,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.order_id, orders.id))
    .leftJoin(orderItems, eq(orderItems.order_id, orders.id))
    .leftJoin(planProducts, eq(planProducts.id, orderItems.plan_product_id))
    .where(inArray(payments.order_id, orgOrderIds))
    .orderBy(desc(payments.created_at))
    .limit(20);

  return c.json({ payments: paymentsResult, next_cursor: null });
});

// ── GET /api/billing/payments/:paymentKey — 결제 단건 ──
app.get("/payments/:paymentKey", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const paymentKey = c.req.param("paymentKey");
  const [payment] = await db.select().from(payments)
    .where(eq(payments.payment_key, paymentKey));
  if (!payment) return c.json({ error: "결제를 찾을 수 없습니다." }, 404);

  const [order] = await db.select({ organization_id: orders.organization_id })
    .from(orders).where(eq(orders.id, payment.order_id));
  if (order?.organization_id !== ctx.org.id) return c.json({ error: "접근 권한이 없습니다." }, 403);

  return c.json({ payment });
});

// ── POST /api/billing/payments/:paymentKey/cancel-request — UC-32 환불 요청 ──
const cancelRequestSchema = z.object({ reason: z.string().min(1) });

app.post("/payments/:paymentKey/cancel-request", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const paymentKey = c.req.param("paymentKey");
  const parsed = cancelRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);

  const [payment] = await db.select().from(payments)
    .where(eq(payments.payment_key, paymentKey));
  if (!payment) return c.json({ error: "결제를 찾을 수 없습니다." }, 404);

  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, payment.order_id), eq(orders.organization_id, ctx.org.id)));
  if (!order) return c.json({ error: "접근 권한이 없습니다." }, 403);

  // PENDING 중복 차단
  const [existing] = await db.select({ id: paymentCancelRequests.id })
    .from(paymentCancelRequests)
    .where(and(
      eq(paymentCancelRequests.order_id, order.id),
      eq(paymentCancelRequests.status, "PENDING")
    ));
  if (existing) return c.json({ error: "이미 환불 요청이 접수되어 있습니다." }, 409);

  const [item] = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));
  const refundAmount = item
    ? calculateRefundAmount(
        Number(item.unit_price), item.quantity, item.used_quantity, item.cancelled_quantity
      )
    : 0;

  await db.insert(paymentCancelRequests).values({
    id: crypto.randomUUID(),
    order_id: order.id,
    requested_by: ctx.user.id,
    reason: parsed.data.reason,
    refund_amount: String(refundAmount),
    status: "PENDING",
  });

  return c.json({ ok: true, refund_amount: refundAmount });
});

// ── C-7c: GET /api/billing/subscription-history — 구독 결제 이벤트 이력 ──
app.get("/subscription-history", async (c) => {
  const ctx = await resolveAdminContext(c);
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const history = await db.select().from(subscriptionHistory)
    .where(eq(subscriptionHistory.organization_id, ctx.org.id))
    .orderBy(desc(subscriptionHistory.created_at))
    .limit(50);

  return c.json({ history });
});

export default app;
