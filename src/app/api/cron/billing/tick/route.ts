// UC-29 정기결제 자동 청구 cron (매일 02:00 KST)
// Phase 6: PLANS 상수 제거 → plan_products DB 조회 기반

import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { db } from "@/db";
import {
  subscriptions,
  orders,
  orderItems,
  orderStatusHistory,
  webhookEvents,
  cronRuns,
  planProducts,
} from "@/db/schema";
import { eq, and, lte, isNotNull, isNull } from "drizzle-orm";
import { tossRequest } from "@/lib/toss";
import { decryptBillingKey } from "@/features/billing/backend/billing-key";
import {
  upsertPayment,
  updateOrderStatus,
  syncOrgPlan,
  recordSubscriptionHistory,
  recordBillingEvent,
} from "@/features/billing/backend/service";
import {
  ORDER_STATUS,
  ORDER_KIND,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_HISTORY_REASON,
  SUBSCRIPTION_HISTORY_KIND,
} from "@/features/billing/backend/constants";

async function verifyQStash(req: NextRequest): Promise<{ body: string; messageId: string } | null> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) return null;

  const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
  const body = await req.text();
  const signature = req.headers.get("Upstash-Signature") ?? "";
  const messageId = req.headers.get("Upstash-Message-Id") ?? "";

  try {
    await receiver.verify({ signature, body });
    return { body, messageId };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const verified = await verifyQStash(req);
  if (!verified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = verified;

  const [existing] = await db.select({ id: webhookEvents.id })
    .from(webhookEvents).where(eq(webhookEvents.event_id, messageId));
  if (existing) return NextResponse.json({ ok: true, skipped: true });

  const runId = crypto.randomUUID();
  await db.insert(cronRuns).values({
    id: runId,
    cron_code: "billing/tick",
    qstash_message_id: messageId,
    triggered_by: "schedule",
    status: "running",
  });

  let processed = 0, succeeded = 0, failed = 0, pastDueNew = 0;

  try {
    const now = new Date();
    const dueSubs = await db.select().from(subscriptions)
      .where(and(
        eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE),
        isNotNull(subscriptions.billing_key_encrypted),
        isNotNull(subscriptions.customer_key),
        isNotNull(subscriptions.next_billing_at),
        isNull(subscriptions.org_deleted_at),
        lte(subscriptions.next_billing_at, now),
      ));

    for (const sub of dueSubs) {
      processed++;
      const orderId = crypto.randomUUID();

      // pending_plan_product_id가 있으면 다운그레이드 적용 (MAX→Pro)
      const isDowngrade = sub.pending_plan_product_id !== null;
      const effectivePlanProductId = sub.pending_plan_product_id ?? sub.plan_product_id;

      if (!effectivePlanProductId) {
        failed++;
        continue;
      }

      // plan_products에서 가격·이름 조회 (PLANS 상수 제거)
      const [planProduct] = await db.select({
        id: planProducts.id,
        price: planProducts.price,
        name: planProducts.name,
        plan_code: planProducts.plan_code,
      }).from(planProducts).where(eq(planProducts.id, effectivePlanProductId));

      if (!planProduct) {
        failed++;
        continue;
      }

      try {
        const billingKey = await decryptBillingKey(sub.billing_key_encrypted!);
        const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

        await db.batch([
          db.insert(orders).values({
            id: orderId,
            organization_id: sub.organization_id,
            subscription_id: sub.id,
            kind: ORDER_KIND.RECURRING,
            status: ORDER_STATUS.AUTH_SUCCESS,
            total_amount: String(planProduct.price),
            expires_at: expiresAt,
            source: "cron",
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
            to_status: ORDER_STATUS.AUTH_SUCCESS,
            changed_by: "cron",
            reason: "recurring_charge_start",
          }),
        ]);

        const result = await tossRequest<Record<string, unknown>>(
          "POST",
          `/billing/${billingKey}`,
          {
            customerKey: sub.customer_key,
            amount: Number(planProduct.price),
            orderId,
            orderName: `IndiePost AI ${planProduct.name} 플랜 (정기결제)`,
          },
          { orderId, type: "RECURRING_CHARGE" }
        );

        if (result.ok) {
          await upsertPayment(result.data.paymentKey as string, orderId, result.data);
          await updateOrderStatus(orderId, ORDER_STATUS.PAY_SUCCESS, "cron", "recurring_success", ORDER_STATUS.AUTH_SUCCESS);

          // drift 버그 수정: current_period_end 기준으로 다음 주기 계산
          const nextBilling = new Date(sub.current_period_end!);
          nextBilling.setMonth(nextBilling.getMonth() + 1);

          if (isDowngrade) {
            // 다운그레이드 확정: plan_product_id 교체, pending 초기화
            await db.update(subscriptions).set({
              plan_product_id: effectivePlanProductId,
              pending_plan_product_id: null,
              next_billing_at: nextBilling,
              current_period_end: nextBilling,
            }).where(eq(subscriptions.id, sub.id));

            await syncOrgPlan(sub.organization_id, effectivePlanProductId);

            await recordBillingEvent({
              subscriptionId: sub.id,
              organizationId: sub.organization_id,
              kind: SUBSCRIPTION_HISTORY_KIND.DOWNGRADED,
              planProductId: effectivePlanProductId,
              periodStart: sub.current_period_end,
              periodEnd: nextBilling,
              nextBillingAt: nextBilling,
              orderId,
              changedBy: "cron",
            });
            await recordSubscriptionHistory({
              subscriptionId: sub.id,
              fromStatus: SUBSCRIPTION_STATUS.ACTIVE,
              toStatus: SUBSCRIPTION_STATUS.ACTIVE,
              changedBy: "cron",
              reason: SUBSCRIPTION_HISTORY_REASON.DOWNGRADE_APPLIED,
            });
          } else {
            // 정기 갱신: plan_product_id 유지
            await db.update(subscriptions).set({
              next_billing_at: nextBilling,
              current_period_end: nextBilling,
            }).where(eq(subscriptions.id, sub.id));

            await recordBillingEvent({
              subscriptionId: sub.id,
              organizationId: sub.organization_id,
              kind: SUBSCRIPTION_HISTORY_KIND.RENEWED,
              planProductId: effectivePlanProductId,
              periodStart: sub.current_period_end,
              periodEnd: nextBilling,
              nextBillingAt: nextBilling,
              orderId,
              changedBy: "cron",
            });
            await recordSubscriptionHistory({
              subscriptionId: sub.id,
              fromStatus: SUBSCRIPTION_STATUS.ACTIVE,
              toStatus: SUBSCRIPTION_STATUS.ACTIVE,
              changedBy: "cron",
              reason: SUBSCRIPTION_HISTORY_REASON.PAYMENT_SUCCESS,
            });
          }

          succeeded++;
        } else {
          await updateOrderStatus(orderId, ORDER_STATUS.PAY_FAIL, "cron", "recurring_failed", ORDER_STATUS.AUTH_SUCCESS);
          await db.update(subscriptions).set({
            status: SUBSCRIPTION_STATUS.PAST_DUE,
            past_due_since: now,
          }).where(eq(subscriptions.id, sub.id));

          await recordSubscriptionHistory({
            subscriptionId: sub.id,
            fromStatus: SUBSCRIPTION_STATUS.ACTIVE,
            toStatus: SUBSCRIPTION_STATUS.PAST_DUE,
            changedBy: "cron",
            reason: SUBSCRIPTION_HISTORY_REASON.PAYMENT_FAIL_PERMANENT,
          });

          failed++;
          pastDueNew++;
        }
      } catch {
        failed++;
      }
    }

    await db.insert(webhookEvents).values({
      id: crypto.randomUUID(),
      event_id: messageId,
      provider: "qstash",
      event_type: "billing/tick",
      payload: { processed, succeeded, failed } as Record<string, unknown>,
    });

    await db.update(cronRuns).set({
      status: "completed",
      result_summary: { processed, succeeded, failed, past_due_new: pastDueNew },
      finished_at: new Date(),
    }).where(eq(cronRuns.id, runId));

    return NextResponse.json({ ok: true, processed, succeeded, failed, past_due_new: pastDueNew });
  } catch (err) {
    await db.update(cronRuns).set({
      status: "failed",
      error_message: String(err),
      finished_at: new Date(),
    }).where(eq(cronRuns.id, runId));

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
