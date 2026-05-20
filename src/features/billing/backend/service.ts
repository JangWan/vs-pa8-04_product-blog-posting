// 결제 서비스 레이어 — tossRequest() 래퍼 기반 핵심 로직
// Phase 6: PLANS 상수 제거 → plan_products 테이블 JOIN 기반으로 전환

import { db } from "@/db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  paymentCancels,
  subscriptions,
  subscriptionStatusHistory,
  subscriptionHistory,
  organizations,
  planProducts,
  usageQuotas,
  users,
} from "@/db/schema";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { tossRequest } from "@/lib/toss";
import { encryptBillingKey, decryptBillingKey } from "./billing-key";
import {
  ACTIVATABLE_STATUSES,
  TOSS_STATUS_MAP,
  AUTO_SYNC_STATUSES,
  ORDER_STATUS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_HISTORY_REASON,
  SUBSCRIPTION_HISTORY_KIND,
  ORDER_KIND,
  PLAN_CODE,
  type OrderStatus,
  type SubscriptionStatus,
  type SubscriptionHistoryKind,
  type PlanCode,
} from "./constants";

// ── 주문 상태 변경 (감사 이력 자동 기록) ──
export async function updateOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  changedBy: string,
  reason?: string,
  fromStatus?: string
) {
  await db.batch([
    db.update(orders).set({ status: toStatus }).where(eq(orders.id, orderId)),
    db.insert(orderStatusHistory).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      from_status: fromStatus ?? null,
      to_status: toStatus,
      changed_by: changedBy,
      reason: reason ?? null,
    }),
  ]);
}

// ── Payments UPSERT ──
export async function upsertPayment(
  paymentKey: string,
  orderId: string,
  rawData: Record<string, unknown>
) {
  const [existing] = await db.select({ id: payments.id })
    .from(payments).where(eq(payments.payment_key, paymentKey));

  const amount = String(rawData.totalAmount ?? rawData.amount ?? 0);
  const balanceAmount = String(rawData.balancedAmount ?? rawData.totalAmount ?? rawData.amount ?? 0);

  if (existing) {
    await db.update(payments).set({
      status: String(rawData.status ?? ""),
      amount,
      balance_amount: balanceAmount,
      approved_at: rawData.approvedAt ? new Date(rawData.approvedAt as string) : null,
      raw_data: rawData,
    }).where(eq(payments.payment_key, paymentKey));
  } else {
    await db.insert(payments).values({
      id: crypto.randomUUID(),
      payment_key: paymentKey,
      order_id: orderId,
      method: (rawData.method as string) ?? null,
      status: String(rawData.status ?? ""),
      amount,
      balance_amount: balanceAmount,
      approved_at: rawData.approvedAt ? new Date(rawData.approvedAt as string) : null,
      raw_data: rawData,
    });
  }
}

// ── 구독 상태 이력 기록 ──
export async function recordSubscriptionHistory(params: {
  subscriptionId: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  billingKeyChanged?: boolean;
  fromPayerUserId?: string | null;
  toPayerUserId?: string | null;
  changedBy: string;
  reason: string;
}) {
  await db.insert(subscriptionStatusHistory).values({
    id: crypto.randomUUID(),
    subscription_id: params.subscriptionId,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    billing_key_changed: params.billingKeyChanged ?? false,
    from_payer_user_id: params.fromPayerUserId ?? null,
    to_payer_user_id: params.toPayerUserId ?? null,
    changed_by: params.changedBy,
    reason: params.reason,
  });
}

// ── Phase 5: 구독 결제 이벤트 기록 ──
export async function recordBillingEvent(params: {
  subscriptionId: string;
  organizationId: string;
  kind: SubscriptionHistoryKind;
  planProductId?: string | null;
  targetPlanProductId?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  nextBillingAt?: Date | null;
  orderId?: string | null;
  changedBy: string;
}): Promise<void> {
  await db.insert(subscriptionHistory).values({
    id: crypto.randomUUID(),
    subscription_id: params.subscriptionId,
    organization_id: params.organizationId,
    kind: params.kind,
    plan_product_id: params.planProductId ?? null,
    target_plan_product_id: params.targetPlanProductId ?? null,
    period_start: params.periodStart ?? null,
    period_end: params.periodEnd ?? null,
    next_billing_at: params.nextBillingAt ?? null,
    order_id: params.orderId ?? null,
    changed_by: params.changedBy,
  });
}

// ── Phase 6: 조직 plan_product_id 동기화 ──
// planCode를 받아 내부에서 plan_products 조회 후 plan_product_id만 갱신 (plan 컬럼 제거)
export async function syncOrgPlan(orgId: string, planProductId: string | null) {
  await db.update(organizations)
    .set({ plan_product_id: planProductId })
    .where(eq(organizations.id, orgId));
}

// planCode로 plan_product_id를 조회하는 헬퍼 (syncOrgPlan 호출 전 사용)
export async function findPlanProductId(
  orgId: string,
  planCode: PlanCode
): Promise<string | null> {
  const [org] = await db.select({ is_default: organizations.is_default })
    .from(organizations).where(eq(organizations.id, orgId));
  const teamType = org?.is_default ? "personal" : "team";

  const [product] = await db.select({ id: planProducts.id })
    .from(planProducts)
    .where(and(
      eq(planProducts.plan_code, planCode),
      eq(planProducts.team_type, teamType),
      eq(planProducts.is_active, true),
    ));
  return product?.id ?? null;
}

// ── Phase C-01: customerKey 조회 또는 생성 ──
export async function getOrCreateCustomerKey(orgId: string): Promise<string> {
  const [org] = await db.select({
    is_default: organizations.is_default,
    owner_user_id: organizations.owner_user_id,
    payment_customer_key: organizations.payment_customer_key,
  }).from(organizations).where(eq(organizations.id, orgId));

  if (!org) throw new Error("ORG_NOT_FOUND");

  if (org.is_default) {
    const [user] = await db.select({ payment_customer_key: users.payment_customer_key })
      .from(users).where(eq(users.id, org.owner_user_id));
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.payment_customer_key) return user.payment_customer_key;
    const newKey = `personal_${crypto.randomUUID()}`;
    await db.update(users).set({ payment_customer_key: newKey }).where(eq(users.id, org.owner_user_id));
    return newKey;
  } else {
    if (org.payment_customer_key) return org.payment_customer_key;
    const newKey = `team_${crypto.randomUUID()}`;
    await db.update(organizations).set({ payment_customer_key: newKey }).where(eq(organizations.id, orgId));
    return newKey;
  }
}

// ── Phase 6: 실질 한도 계산 — plan_products JOIN 기반 ──
// 개인 org: organizations.plan_product_id → plan_products
// 팀 org: subscriptions.plan_product_id → plan_products
export async function resolveEffectiveLimits(orgId: string): Promise<{
  generations_per_month: number;
  translations_per_month: number;
  agent_runs_per_month: number;
}> {
  const zero = { generations_per_month: 0, translations_per_month: 0, agent_runs_per_month: 0 };

  const [org] = await db.select({
    is_default: organizations.is_default,
    plan_product_id: organizations.plan_product_id,
  }).from(organizations).where(eq(organizations.id, orgId));

  if (!org) return zero;

  if (org.is_default) {
    // 개인 org: organizations.plan_product_id → plan_products
    const productId = org.plan_product_id;
    if (!productId) {
      // plan_product_id 미설정 시 free 플랜 조회로 폴백
      const [freeProd] = await db.select({
        generations_per_month: planProducts.generations_per_month,
        translations_per_month: planProducts.translations_per_month,
        agent_runs_per_month: planProducts.agent_runs_per_month,
      }).from(planProducts).where(and(
        eq(planProducts.plan_code, PLAN_CODE.FREE),
        eq(planProducts.team_type, "personal"),
      ));
      return freeProd ?? zero;
    }
    const [product] = await db.select({
      generations_per_month: planProducts.generations_per_month,
      translations_per_month: planProducts.translations_per_month,
      agent_runs_per_month: planProducts.agent_runs_per_month,
    }).from(planProducts).where(eq(planProducts.id, productId));
    return product ?? zero;
  }

  // 팀 org: 가장 최근 비취소 구독 조회
  const [sub] = await db.select({
    status: subscriptions.status,
    plan_product_id: subscriptions.plan_product_id,
  }).from(subscriptions)
    .where(and(
      eq(subscriptions.organization_id, orgId),
      isNotNull(subscriptions.status),
    ))
    .orderBy(desc(subscriptions.created_at))
    .limit(1);

  if (!sub || sub.status === SUBSCRIPTION_STATUS.CANCELED || sub.status === SUBSCRIPTION_STATUS.SUSPENDED) {
    return zero;
  }

  if (!sub.plan_product_id) return zero;

  const [product] = await db.select({
    generations_per_month: planProducts.generations_per_month,
    translations_per_month: planProducts.translations_per_month,
    agent_runs_per_month: planProducts.agent_runs_per_month,
  }).from(planProducts).where(eq(planProducts.id, sub.plan_product_id));

  return product ?? zero;
}

// ── Phase 6: 초대 가능 여부 검증 — plan_products JOIN 기반 ──
export async function validateInviteCapacity(orgId: string): Promise<{
  allowed: boolean;
  code?: string;
}> {
  const [org] = await db.select({
    is_default: organizations.is_default,
    plan_product_id: organizations.plan_product_id,
    member_count: organizations.member_count,
  }).from(organizations).where(eq(organizations.id, orgId));

  if (!org) return { allowed: false, code: "ORG_NOT_FOUND" };
  if (org.is_default) return { allowed: false, code: "PERSONAL_ORG_NO_INVITE" };
  if (!org.plan_product_id) return { allowed: false, code: "FREE_PLAN_NO_INVITE" };

  const [product] = await db.select({
    plan_code: planProducts.plan_code,
    max_members: planProducts.max_members,
  }).from(planProducts).where(eq(planProducts.id, org.plan_product_id));

  if (!product || product.plan_code === PLAN_CODE.FREE) {
    return { allowed: false, code: "FREE_PLAN_NO_INVITE" };
  }

  // max_members가 null이면 무제한 (MAX 플랜)
  if (product.max_members !== null && org.member_count >= product.max_members) {
    return { allowed: false, code: "MEMBER_LIMIT_REACHED" };
  }

  return { allowed: true };
}

// ── Phase 6: 구독 활성화 — plan_product_id 기반 ──
async function activateSubscription(
  orderId: string,
  billingKey: string,
  customerKey: string,
  payerUserId?: string,
  cardLast4?: string | null,
  cardCompany?: string | null,
) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return;

  // orderItems.plan_product_id로 플랜 상품 확인
  const [item] = await db.select({ plan_product_id: orderItems.plan_product_id })
    .from(orderItems).where(eq(orderItems.order_id, orderId));
  const planProductId = item?.plan_product_id ?? null;

  // plan_code는 syncOrgPlan 헬퍼용으로만 조회
  let planCode: PlanCode = PLAN_CODE.PRO;
  if (planProductId) {
    const [prod] = await db.select({ plan_code: planProducts.plan_code })
      .from(planProducts).where(eq(planProducts.id, planProductId));
    planCode = (prod?.plan_code ?? PLAN_CODE.PRO) as PlanCode;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const encryptedKey = await encryptBillingKey(billingKey);

  const [existingSub] = await db.select({
    id: subscriptions.id,
    status: subscriptions.status,
    payer_user_id: subscriptions.payer_user_id,
  })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.organization_id, order.organization_id),
      isNull(subscriptions.canceled_at),
    ));

  // 재구독 여부: canceled 포함 모든 구독 이력 확인
  const [anySub] = await db.select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.organization_id, order.organization_id))
    .limit(1);
  const isResubscription = !!anySub;

  const newStatus = SUBSCRIPTION_STATUS.ACTIVE;
  let activeSubId: string;

  if (existingSub) {
    activeSubId = existingSub.id;
    await db.update(subscriptions).set({
      plan_product_id: planProductId,
      status: newStatus,
      billing_key_encrypted: encryptedKey,
      customer_key: customerKey,
      payer_user_id: payerUserId ?? null,
      card_last4: cardLast4 ?? null,
      card_company: cardCompany ?? null,
      next_billing_at: periodEnd,
      current_period_end: periodEnd,
      cancel_scheduled_at: null,
      canceled_at: null,
      past_due_since: null,
      pending_plan_product_id: null,
    }).where(eq(subscriptions.id, existingSub.id));

    await recordSubscriptionHistory({
      subscriptionId: existingSub.id,
      fromStatus: existingSub.status as SubscriptionStatus,
      toStatus: newStatus,
      billingKeyChanged: true,
      fromPayerUserId: existingSub.payer_user_id,
      toPayerUserId: payerUserId ?? null,
      changedBy: payerUserId ?? "system",
      reason: SUBSCRIPTION_HISTORY_REASON.INITIAL_ACTIVATION,
    });
  } else {
    activeSubId = crypto.randomUUID();
    await db.insert(subscriptions).values({
      id: activeSubId,
      organization_id: order.organization_id,
      plan_product_id: planProductId,
      status: newStatus,
      billing_key_encrypted: encryptedKey,
      customer_key: customerKey,
      payer_user_id: payerUserId ?? null,
      card_last4: cardLast4 ?? null,
      card_company: cardCompany ?? null,
      next_billing_at: periodEnd,
      current_period_end: periodEnd,
    });

    await recordSubscriptionHistory({
      subscriptionId: activeSubId,
      fromStatus: null,
      toStatus: newStatus,
      billingKeyChanged: true,
      toPayerUserId: payerUserId ?? null,
      changedBy: payerUserId ?? "system",
      reason: SUBSCRIPTION_HISTORY_REASON.INITIAL_ACTIVATION,
    });
  }

  // org plan_product_id 동기화
  const newPlanProductId = await findPlanProductId(order.organization_id, planCode);
  await syncOrgPlan(order.organization_id, newPlanProductId);

  await recordBillingEvent({
    subscriptionId: activeSubId,
    organizationId: order.organization_id,
    kind: isResubscription
      ? SUBSCRIPTION_HISTORY_KIND.RESUBSCRIBED
      : SUBSCRIPTION_HISTORY_KIND.ACTIVATED,
    planProductId: planProductId,
    periodStart: now,
    periodEnd,
    nextBillingAt: periodEnd,
    orderId,
    changedBy: payerUserId ?? "system",
  });

  // 첫 달 usage_quotas 초기화
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await db.insert(usageQuotas).values({
    id: crypto.randomUUID(),
    organization_id: order.organization_id,
    period_month: periodMonth,
    generations_used: 0,
    translations_used: 0,
    agent_runs_used: 0,
  }).onConflictDoNothing();
}

// ── UC-28 빌링키 발급 + 즉시 1회차 결제 ──
export async function issueBillingKeyAndCharge(
  authKey: string,
  customerKey: string,
  orderId: string,
  payerUserId?: string
): Promise<{ success: boolean; status?: OrderStatus; paymentKey?: string; data?: unknown; code?: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { success: false, code: "ORDER_NOT_FOUND" };

  if (!ACTIVATABLE_STATUSES.includes(order.status as OrderStatus)) {
    return { success: false, code: "INVALID_ORDER_STATUS" };
  }

  await updateOrderStatus(orderId, ORDER_STATUS.AUTH_SUCCESS, "system", "billing_auth_success", order.status);

  const issueResult = await tossRequest<Record<string, unknown>>(
    "POST",
    "/billing/authorizations/issue",
    { authKey, customerKey },
    { orderId, type: "BILLING_KEY_ISSUE" }
  );

  if (!issueResult.ok) {
    await updateOrderStatus(orderId, ORDER_STATUS.PAY_FAIL, "system", "billing_key_issue_failed", ORDER_STATUS.AUTH_SUCCESS);
    return { success: false, code: "BILLING_KEY_ISSUE_FAILED", data: issueResult.data };
  }

  const billingKey = issueResult.data.billingKey as string;

  // plan_product_id → 이름 조회 (DB 기반)
  const [chargeItem] = await db.select({ plan_product_id: orderItems.plan_product_id })
    .from(orderItems).where(eq(orderItems.order_id, orderId));
  let orderName = "IndiePost AI Pro 플랜";
  if (chargeItem?.plan_product_id) {
    const [prod] = await db.select({ name: planProducts.name })
      .from(planProducts).where(eq(planProducts.id, chargeItem.plan_product_id));
    if (prod) orderName = `IndiePost AI ${prod.name} 플랜`;
  }

  const amount = Number(order.total_amount);

  const chargeResult = await tossRequest<Record<string, unknown>>(
    "POST",
    `/billing/${billingKey}`,
    { customerKey, orderId, orderName, amount, currency: "KRW" },
    { orderId, type: "RECURRING_CHARGE" }
  );

  if (!chargeResult.ok) {
    await updateOrderStatus(orderId, ORDER_STATUS.PAY_FAIL, "system", "billing_charge_failed", ORDER_STATUS.AUTH_SUCCESS);
    return { success: false, code: "BILLING_CHARGE_FAILED", data: chargeResult.data };
  }

  const paymentData = chargeResult.data;
  const paymentKey = paymentData.paymentKey as string;

  const chargeCard = paymentData.card as Record<string, unknown> | undefined;
  const chargeCardNumber = chargeCard?.number as string | undefined;
  const chargeCardLast4 = chargeCardNumber ? chargeCardNumber.slice(-4) : null;
  const chargeCardCompany = (chargeCard?.company as string | undefined) ?? null;

  await upsertPayment(paymentKey, orderId, paymentData);
  await updateOrderStatus(orderId, ORDER_STATUS.PAY_SUCCESS, "system", "billing_charge_success", ORDER_STATUS.AUTH_SUCCESS);
  await activateSubscription(orderId, billingKey, customerKey, payerUserId, chargeCardLast4, chargeCardCompany);

  return { success: true, status: ORDER_STATUS.PAY_SUCCESS, paymentKey, data: paymentData };
}

// ── Phase 6: 결제 수단 변경 — 빌링키 교체 = 새 subscription 행 생성 ──
export async function updateBillingKey(
  authKey: string,
  customerKey: string,
  orderId: string,
  payerUserId?: string
): Promise<{ success: boolean; code?: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { success: false, code: "ORDER_NOT_FOUND" };

  if (!ACTIVATABLE_STATUSES.includes(order.status as OrderStatus)) {
    return { success: false, code: "INVALID_ORDER_STATUS" };
  }

  await updateOrderStatus(orderId, ORDER_STATUS.AUTH_SUCCESS, "system", "billing_auth_success", order.status);

  const issueResult = await tossRequest<Record<string, unknown>>(
    "POST",
    "/billing/authorizations/issue",
    { authKey, customerKey },
    { orderId, type: "BILLING_KEY_ISSUE" }
  );

  if (!issueResult.ok) {
    await updateOrderStatus(orderId, ORDER_STATUS.PAY_FAIL, "system", "billing_key_issue_failed", ORDER_STATUS.AUTH_SUCCESS);
    return { success: false, code: "BILLING_KEY_ISSUE_FAILED" };
  }

  const billingKey = issueResult.data.billingKey as string;
  const encryptedKey = await encryptBillingKey(billingKey);

  const cardData = issueResult.data.card as Record<string, unknown> | undefined;
  const cardNumber = cardData?.number as string | undefined;
  const newCardLast4 = cardNumber ? cardNumber.slice(-4) : null;
  const newCardCompany = (cardData?.company as string | undefined) ?? null;

  const [sub] = await db.select().from(subscriptions)
    .where(and(
      eq(subscriptions.organization_id, order.organization_id),
      isNull(subscriptions.canceled_at),
    ));

  if (!sub) {
    await updateOrderStatus(orderId, ORDER_STATUS.PAY_FAIL, "system", "no_subscription_found", ORDER_STATUS.AUTH_SUCCESS);
    return { success: false, code: "NO_SUBSCRIPTION" };
  }

  const now = new Date();
  const wasSuspended = sub.status === SUBSCRIPTION_STATUS.SUSPENDED;

  await db.update(subscriptions).set({
    status: SUBSCRIPTION_STATUS.CANCELED,
    billing_key_encrypted: null,
    canceled_at: now,
    next_billing_at: null,
  }).where(eq(subscriptions.id, sub.id));

  await recordSubscriptionHistory({
    subscriptionId: sub.id,
    fromStatus: sub.status as SubscriptionStatus,
    toStatus: SUBSCRIPTION_STATUS.CANCELED,
    billingKeyChanged: true,
    fromPayerUserId: sub.payer_user_id,
    toPayerUserId: payerUserId ?? sub.payer_user_id,
    changedBy: payerUserId ?? "system",
    reason: SUBSCRIPTION_HISTORY_REASON.PAYMENT_METHOD_UPDATE,
  });

  const newPeriodEnd = wasSuspended
    ? (() => { const d = new Date(now); d.setMonth(d.getMonth() + 1); return d; })()
    : sub.current_period_end;
  const newNextBilling = wasSuspended ? newPeriodEnd : sub.next_billing_at;

  const newSubId = crypto.randomUUID();
  await db.insert(subscriptions).values({
    id: newSubId,
    organization_id: order.organization_id,
    plan_product_id: sub.plan_product_id,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    billing_key_encrypted: encryptedKey,
    customer_key: customerKey,
    payer_user_id: payerUserId ?? sub.payer_user_id,
    payer_warning: false,
    card_last4: newCardLast4,
    card_company: newCardCompany,
    next_billing_at: newNextBilling,
    current_period_end: newPeriodEnd,
    past_due_since: null,
    // 다운그레이드 예약 상속
    pending_plan_product_id: sub.pending_plan_product_id,
  });

  await recordSubscriptionHistory({
    subscriptionId: newSubId,
    fromStatus: null,
    toStatus: SUBSCRIPTION_STATUS.ACTIVE,
    billingKeyChanged: true,
    toPayerUserId: payerUserId ?? sub.payer_user_id,
    changedBy: payerUserId ?? "system",
    reason: SUBSCRIPTION_HISTORY_REASON.PAYMENT_METHOD_UPDATE,
  });

  await recordBillingEvent({
    subscriptionId: newSubId,
    organizationId: order.organization_id,
    kind: SUBSCRIPTION_HISTORY_KIND.BILLING_KEY_REPLACED,
    planProductId: sub.plan_product_id,
    periodStart: wasSuspended ? now : undefined,
    periodEnd: newPeriodEnd ?? undefined,
    nextBillingAt: newNextBilling ?? undefined,
    orderId,
    changedBy: payerUserId ?? "system",
  });

  await updateOrderStatus(orderId, ORDER_STATUS.PAY_SUCCESS, "system", "billing_key_replaced", ORDER_STATUS.AUTH_SUCCESS);

  return { success: true };
}

// ── 서비스 미사용 즉시 취소 (전액 환불) ──
export async function cancelSubscriptionImmediate(
  orgId: string
): Promise<{ success: boolean; code?: string }> {
  const [recentOrder] = await db.select()
    .from(orders)
    .where(and(
      eq(orders.organization_id, orgId),
      eq(orders.status, ORDER_STATUS.PAY_SUCCESS)
    ))
    .orderBy(desc(orders.created_at))
    .limit(1);

  if (!recentOrder) return { success: false, code: "NO_PAID_ORDER" };

  const [payment] = await db.select()
    .from(payments)
    .where(eq(payments.order_id, recentOrder.id))
    .limit(1);

  if (!payment) return { success: false, code: "NO_PAYMENT" };

  const cancelResult = await tossRequest<Record<string, unknown>>(
    "POST",
    `/payments/${payment.payment_key}/cancel`,
    { cancelReason: "구독 미사용 취소" },
    { orderId: recentOrder.id, type: "CANCEL" }
  );

  if (!cancelResult.ok) return { success: false, code: "TOSS_CANCEL_FAILED" };

  const cancelData = cancelResult.data;
  const cancelInfo = (cancelData.cancels as Record<string, unknown>[] | undefined)?.[0] ?? {};

  await db.insert(paymentCancels).values({
    id: crypto.randomUUID(),
    payment_key: payment.payment_key,
    cancel_request_id: null,
    cancel_amount: String(Number(payment.amount)),
    transaction_key: (cancelInfo.transactionKey as string) ?? null,
    canceled_at: cancelInfo.canceledAt ? new Date(cancelInfo.canceledAt as string) : new Date(),
    raw_data: cancelData,
  });

  await updateOrderStatus(recentOrder.id, ORDER_STATUS.PAY_CANCELED, "system", "immediate_cancel", ORDER_STATUS.PAY_SUCCESS);

  const [sub] = await db.select({ id: subscriptions.id, status: subscriptions.status, payer_user_id: subscriptions.payer_user_id })
    .from(subscriptions).where(eq(subscriptions.organization_id, orgId));

  await db.update(subscriptions).set({
    status: SUBSCRIPTION_STATUS.CANCELED,
    billing_key_encrypted: null,
    canceled_at: new Date(),
    next_billing_at: null,
  }).where(eq(subscriptions.organization_id, orgId));

  if (sub) {
    await recordSubscriptionHistory({
      subscriptionId: sub.id,
      fromStatus: sub.status as SubscriptionStatus,
      toStatus: SUBSCRIPTION_STATUS.CANCELED,
      billingKeyChanged: true,
      fromPayerUserId: sub.payer_user_id,
      changedBy: "system",
      reason: SUBSCRIPTION_HISTORY_REASON.CANCEL_IMMEDIATE,
    });
  }

  // free plan_product_id 조회 후 org 동기화
  const freePlanProductId = await findPlanProductId(orgId, PLAN_CODE.FREE);
  await syncOrgPlan(orgId, freePlanProductId);

  return { success: true };
}

// ── Phase 6: Pro→MAX 즉시 업그레이드 — plan_product_id 교체 방식 ──
// override_* 제거: plan_product_id를 MAX로 교체하면 resolveEffectiveLimits()가 자동으로 MAX 한도 반영
export async function upgradeSubscription(
  orgId: string,
  payerUserId: string
): Promise<{ success: boolean; code?: string; chargedAmount?: number }> {
  const [org] = await db.select({ is_default: organizations.is_default })
    .from(organizations).where(eq(organizations.id, orgId));
  if (!org) return { success: false, code: "ORG_NOT_FOUND" };
  const teamType = org.is_default ? "personal" : "team";

  // 활성 구독 조회
  const [sub] = await db.select().from(subscriptions)
    .where(and(
      eq(subscriptions.organization_id, orgId),
      eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE),
    ));

  if (!sub) return { success: false, code: "NO_ACTIVE_PRO_SUBSCRIPTION" };
  if (!sub.billing_key_encrypted || !sub.customer_key) return { success: false, code: "NO_BILLING_KEY" };
  if (!sub.plan_product_id) return { success: false, code: "NO_ACTIVE_PRO_SUBSCRIPTION" };

  // 현재 플랜이 Pro인지 확인
  const [currentProd] = await db.select({
    plan_code: planProducts.plan_code,
    price: planProducts.price,
  }).from(planProducts).where(eq(planProducts.id, sub.plan_product_id));

  if (currentProd?.plan_code !== PLAN_CODE.PRO) {
    return { success: false, code: "NO_ACTIVE_PRO_SUBSCRIPTION" };
  }

  // MAX 상품 조회
  const [maxProd] = await db.select({
    id: planProducts.id,
    price: planProducts.price,
    name: planProducts.name,
  }).from(planProducts).where(and(
    eq(planProducts.plan_code, PLAN_CODE.MAX),
    eq(planProducts.team_type, teamType),
    eq(planProducts.is_active, true),
  ));

  if (!maxProd) return { success: false, code: "NO_MAX_PLAN_FOUND" };

  const now = new Date();
  const periodEnd = sub.current_period_end;
  const remainingMs = periodEnd.getTime() - now.getTime();
  const remainingDays = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60 * 24)));
  const proratedAmount = Math.floor(
    (Number(maxProd.price) - Number(currentProd.price)) / 30 * remainingDays
  );

  if (proratedAmount <= 0) return { success: false, code: "NO_REMAINING_DAYS" };

  const orderId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  await db.batch([
    db.insert(orders).values({
      id: orderId,
      organization_id: orgId,
      subscription_id: sub.id,
      kind: ORDER_KIND.PLAN_UPGRADE,
      status: ORDER_STATUS.AUTH_SUCCESS,
      total_amount: String(proratedAmount),
      expires_at: expiresAt,
      source: "user",
    }),
    db.insert(orderItems).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      plan_product_id: maxProd.id,
      quantity: 1,
      unit_price: String(proratedAmount),
      period_months: 0,
    }),
    db.insert(orderStatusHistory).values({
      id: crypto.randomUUID(),
      order_id: orderId,
      to_status: ORDER_STATUS.AUTH_SUCCESS,
      changed_by: payerUserId,
      reason: "upgrade_prorated_charge",
    }),
  ]);

  const billingKey = await decryptBillingKey(sub.billing_key_encrypted);
  const chargeResult = await tossRequest<Record<string, unknown>>(
    "POST",
    `/billing/${billingKey}`,
    {
      customerKey: sub.customer_key,
      amount: proratedAmount,
      orderId,
      orderName: `IndiePost AI ${maxProd.name} 플랜 업그레이드 (일할)`,
    },
    { orderId, type: "RECURRING_CHARGE" }
  );

  if (!chargeResult.ok) {
    await updateOrderStatus(orderId, ORDER_STATUS.PAY_FAIL, payerUserId, "upgrade_charge_failed", ORDER_STATUS.AUTH_SUCCESS);
    return { success: false, code: "UPGRADE_CHARGE_FAILED" };
  }

  await upsertPayment(chargeResult.data.paymentKey as string, orderId, chargeResult.data);
  await updateOrderStatus(orderId, ORDER_STATUS.PAY_SUCCESS, payerUserId, "upgrade_charge_success", ORDER_STATUS.AUTH_SUCCESS);

  // subscriptions.plan_product_id → MAX로 교체 (override_* 불필요)
  await db.update(subscriptions).set({
    plan_product_id: maxProd.id,
  }).where(eq(subscriptions.id, sub.id));

  await recordSubscriptionHistory({
    subscriptionId: sub.id,
    fromStatus: SUBSCRIPTION_STATUS.ACTIVE,
    toStatus: SUBSCRIPTION_STATUS.ACTIVE,
    fromPayerUserId: sub.payer_user_id,
    toPayerUserId: payerUserId,
    changedBy: payerUserId,
    reason: SUBSCRIPTION_HISTORY_REASON.PLAN_UPGRADED,
  });

  await syncOrgPlan(orgId, maxProd.id);

  return { success: true, chargedAmount: proratedAmount };
}

// ── Phase 6: MAX→Pro 다운그레이드 예약 — pending_plan_product_id 사용 ──
export async function scheduleDowngrade(
  orgId: string,
  changedBy: string
): Promise<{ success: boolean; code?: string }> {
  const [sub] = await db.select({
    id: subscriptions.id,
    status: subscriptions.status,
    plan_product_id: subscriptions.plan_product_id,
  }).from(subscriptions)
    .where(and(
      eq(subscriptions.organization_id, orgId),
      eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE),
    ));

  if (!sub) return { success: false, code: "NO_ACTIVE_MAX_SUBSCRIPTION" };
  if (!sub.plan_product_id) return { success: false, code: "NO_ACTIVE_MAX_SUBSCRIPTION" };

  // 현재 플랜이 MAX인지 확인
  const [currentProd] = await db.select({ plan_code: planProducts.plan_code })
    .from(planProducts).where(eq(planProducts.id, sub.plan_product_id));
  if (currentProd?.plan_code !== PLAN_CODE.MAX) {
    return { success: false, code: "NO_ACTIVE_MAX_SUBSCRIPTION" };
  }

  // Pro plan_product_id 조회
  const [org] = await db.select({ is_default: organizations.is_default })
    .from(organizations).where(eq(organizations.id, orgId));
  const teamType = org?.is_default ? "personal" : "team";

  const [proProd] = await db.select({ id: planProducts.id })
    .from(planProducts).where(and(
      eq(planProducts.plan_code, PLAN_CODE.PRO),
      eq(planProducts.team_type, teamType),
      eq(planProducts.is_active, true),
    ));
  if (!proProd) return { success: false, code: "PRO_PLAN_NOT_FOUND" };

  await db.update(subscriptions)
    .set({ pending_plan_product_id: proProd.id })
    .where(eq(subscriptions.id, sub.id));

  await recordSubscriptionHistory({
    subscriptionId: sub.id,
    fromStatus: SUBSCRIPTION_STATUS.ACTIVE,
    toStatus: SUBSCRIPTION_STATUS.ACTIVE,
    changedBy,
    reason: SUBSCRIPTION_HISTORY_REASON.DOWNGRADE_SCHEDULED,
  });

  return { success: true };
}

// ── Phase 6: 다운그레이드 예약 취소 ──
export async function cancelScheduledDowngrade(
  orgId: string,
  changedBy: string
): Promise<{ success: boolean; code?: string }> {
  const [sub] = await db.select({
    id: subscriptions.id,
    pending_plan_product_id: subscriptions.pending_plan_product_id,
  }).from(subscriptions)
    .where(and(
      eq(subscriptions.organization_id, orgId),
      eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE),
    ));

  if (!sub) return { success: false, code: "NO_ACTIVE_SUBSCRIPTION" };
  if (!sub.pending_plan_product_id) return { success: false, code: "NO_SCHEDULED_DOWNGRADE" };

  await db.update(subscriptions)
    .set({ pending_plan_product_id: null })
    .where(eq(subscriptions.id, sub.id));

  // changedBy 파라미터는 추후 이력 기록 확장 시 활용
  void changedBy;

  return { success: true };
}

// ── 폴백 상태 동기화 (AUTH_SUCCESS 멈춤 복구) ──
export async function syncTossPaymentStatus(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;

  if (order.status === ORDER_STATUS.ORDER) return order.status;
  if (!AUTO_SYNC_STATUSES.includes(order.status as OrderStatus)) return order.status;

  const result = await tossRequest<Record<string, unknown>>(
    "GET",
    `/payments/orders/${orderId}`,
    undefined,
    { orderId, type: "SYNC" }
  );

  if (result.ok) {
    await upsertPayment(result.data.paymentKey as string, orderId, result.data);
    const targetStatus = (TOSS_STATUS_MAP[result.data.status as string] ?? ORDER_STATUS.PAY_SUCCESS) as OrderStatus;
    await updateOrderStatus(orderId, targetStatus, "system", "sync", order.status);
    return targetStatus;
  } else if (result.status === 404) {
    const now = new Date();
    if (order.expires_at && new Date(order.expires_at) < now) {
      await updateOrderStatus(orderId, ORDER_STATUS.PAY_EXPIRED, "system", "expired", order.status);
      return ORDER_STATUS.PAY_EXPIRED;
    }
  }
  return order.status;
}

// ── G-02/G-03/G-04: 사용량 한도 체크 ──
export type QuotaType = "generations" | "translations" | "agent_runs";

export async function checkQuota(
  orgId: string,
  type: QuotaType
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = await resolveEffectiveLimits(orgId);
  const limitValue =
    type === "generations" ? limits.generations_per_month
    : type === "translations" ? limits.translations_per_month
    : limits.agent_runs_per_month;

  if (limitValue === 0) return { allowed: false, used: 0, limit: 0 };

  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [quota] = await db.select().from(usageQuotas).where(and(
    eq(usageQuotas.organization_id, orgId),
    eq(usageQuotas.period_month, periodMonth),
  ));

  const used =
    type === "generations" ? (quota?.generations_used ?? 0)
    : type === "translations" ? (quota?.translations_used ?? 0)
    : (quota?.agent_runs_used ?? 0);

  return { allowed: used < limitValue, used, limit: limitValue };
}

// ── G-02/G-03/G-04: 사용량 증가 (UPSERT, 원자적) ──
export async function incrementQuota(orgId: string, type: QuotaType): Promise<void> {
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const base = { id: crypto.randomUUID(), organization_id: orgId, period_month: periodMonth };
  const conflictTarget = [usageQuotas.organization_id, usageQuotas.period_month];

  if (type === "generations") {
    await db.insert(usageQuotas).values({ ...base, generations_used: 1 })
      .onConflictDoUpdate({ target: conflictTarget, set: { generations_used: sql`${usageQuotas.generations_used} + 1` } });
  } else if (type === "translations") {
    await db.insert(usageQuotas).values({ ...base, translations_used: 1 })
      .onConflictDoUpdate({ target: conflictTarget, set: { translations_used: sql`${usageQuotas.translations_used} + 1` } });
  } else {
    await db.insert(usageQuotas).values({ ...base, agent_runs_used: 1 })
      .onConflictDoUpdate({ target: conflictTarget, set: { agent_runs_used: sql`${usageQuotas.agent_runs_used} + 1` } });
  }
}

// ── 환불 금액 계산 ──
export function calculateRefundAmount(
  unitPrice: number,
  quantity: number,
  usedQuantity: number,
  cancelledQuantity: number
): number {
  const refundableQty = quantity - usedQuantity - cancelledQuantity;
  return Math.floor(unitPrice * refundableQty * 0.9);
}
