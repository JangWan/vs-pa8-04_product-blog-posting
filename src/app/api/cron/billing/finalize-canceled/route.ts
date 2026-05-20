// 해지 예약 완결 + past_due 3일 grace 종료 cron (매일 04:00 KST)
// 1) status='cancel_scheduled' + current_period_end <= now → canceled + 빌링키 파기 (BR-38, BR-39)
// 2) status='past_due' + past_due_since + 3일 < now → canceled + plan='free' + 빌링키 파기

import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { db } from "@/db";
import { subscriptions, organizations, webhookEvents, cronRuns } from "@/db/schema";
import { and, eq, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { tossRequest } from "@/lib/toss";
import { decryptBillingKey } from "@/features/billing/backend/billing-key";
import { recordSubscriptionHistory, syncOrgPlan } from "@/features/billing/backend/service";
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_HISTORY_REASON, PLAN_CODE, type SubscriptionStatus } from "@/lib/constants";

async function verifyQStash(req: NextRequest): Promise<{ messageId: string } | null> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) return null;

  const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
  const body = await req.text();
  const signature = req.headers.get("Upstash-Signature") ?? "";
  const messageId = req.headers.get("Upstash-Message-Id") ?? "";

  try {
    await receiver.verify({ signature, body });
    return { messageId };
  } catch {
    return null;
  }
}

// 빌링키 파기 (BR-39): Toss 200 확인 후에만 DB NULL 설정
async function revokeBillingKey(subId: string, encryptedKey: string | null) {
  if (!encryptedKey) return;
  try {
    const billingKey = await decryptBillingKey(encryptedKey);
    const result = await tossRequest("DELETE", `/billing/authorizations/${billingKey}`, undefined, {
      type: "BILLING_KEY_DELETE",
    });
    if (result.ok) {
      await db.update(subscriptions).set({ billing_key_encrypted: null }).where(eq(subscriptions.id, subId));
    }
  } catch {
    // 실패 시 다음 cron 재시도 (payment_logs ERR 자동 기록)
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
    cron_code: "billing/finalize-canceled",
    qstash_message_id: messageId,
    triggered_by: "schedule",
    status: "running",
  });

  let cancelFinalized = 0, pastDueFinalized = 0, hardDeleteFinalized = 0;

  try {
    const now = new Date();

    // 1) 해지 예약 만료 처리 (status='cancel_scheduled' + current_period_end 경과)
    const scheduledCancels = await db.select().from(subscriptions)
      .where(and(
        eq(subscriptions.status, SUBSCRIPTION_STATUS.CANCEL_SCHEDULED),
        lte(subscriptions.current_period_end, now)
      ));

    for (const sub of scheduledCancels) {
      await db.update(subscriptions).set({
        status: SUBSCRIPTION_STATUS.CANCELED,
        canceled_at: now,
        next_billing_at: null,
      }).where(eq(subscriptions.id, sub.id));

      await syncOrgPlan(sub.organization_id, PLAN_CODE.FREE);
      await revokeBillingKey(sub.id, sub.billing_key_encrypted);

      await recordSubscriptionHistory({
        subscriptionId: sub.id,
        fromStatus: SUBSCRIPTION_STATUS.CANCEL_SCHEDULED,
        toStatus: SUBSCRIPTION_STATUS.CANCELED,
        billingKeyChanged: true,
        changedBy: "cron",
        reason: SUBSCRIPTION_HISTORY_REASON.FINALIZED_CANCEL,
      });

      cancelFinalized++;
    }

    // 2) past_due 3일 grace 종료
    const gracePast = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const pastDueSubs = await db.select().from(subscriptions)
      .where(and(
        eq(subscriptions.status, SUBSCRIPTION_STATUS.PAST_DUE),
        isNotNull(subscriptions.past_due_since),
        lte(subscriptions.past_due_since, gracePast)
      ));

    for (const sub of pastDueSubs) {
      await db.update(subscriptions).set({
        status: SUBSCRIPTION_STATUS.CANCELED,
        canceled_at: now,
        next_billing_at: null,
      }).where(eq(subscriptions.id, sub.id));

      await syncOrgPlan(sub.organization_id, PLAN_CODE.FREE);
      await revokeBillingKey(sub.id, sub.billing_key_encrypted);

      await recordSubscriptionHistory({
        subscriptionId: sub.id,
        fromStatus: SUBSCRIPTION_STATUS.PAST_DUE,
        toStatus: SUBSCRIPTION_STATUS.CANCELED,
        billingKeyChanged: true,
        changedBy: "cron",
        reason: SUBSCRIPTION_HISTORY_REASON.FINALIZED_CANCEL,
      });

      pastDueFinalized++;
    }

    // 3) D-03: org hard-delete — 30일 grace 경과 조직의 구독 완결
    const hardDeleteThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const expiredOrgs = await db.select({ id: organizations.id })
      .from(organizations)
      .where(and(
        isNotNull(organizations.deleted_at),
        lte(organizations.deleted_at, hardDeleteThreshold),
      ));

    for (const org of expiredOrgs) {
      // org_deleted_at IS NOT NULL이며 아직 canceled되지 않은 구독 완결
      const activeSubs = await db.select().from(subscriptions)
        .where(and(
          eq(subscriptions.organization_id, org.id),
          isNotNull(subscriptions.org_deleted_at),
          ne(subscriptions.status, SUBSCRIPTION_STATUS.CANCELED),
        ));

      for (const sub of activeSubs) {
        await db.update(subscriptions).set({
          status: SUBSCRIPTION_STATUS.CANCELED,
          canceled_at: now,
          next_billing_at: null,
        }).where(eq(subscriptions.id, sub.id));

        await syncOrgPlan(org.id, PLAN_CODE.FREE);

        await recordSubscriptionHistory({
          subscriptionId: sub.id,
          fromStatus: sub.status as SubscriptionStatus,
          toStatus: SUBSCRIPTION_STATUS.CANCELED,
          changedBy: "cron",
          reason: SUBSCRIPTION_HISTORY_REASON.ORG_HARD_DELETE,
        });

        hardDeleteFinalized++;
      }
    }

    await db.insert(webhookEvents).values({
      id: crypto.randomUUID(),
      event_id: messageId,
      provider: "qstash",
      event_type: "billing/finalize-canceled",
      payload: { cancelFinalized, pastDueFinalized, hardDeleteFinalized } as Record<string, unknown>,
    });

    await db.update(cronRuns).set({
      status: "completed",
      result_summary: { cancel_finalized: cancelFinalized, past_due_finalized: pastDueFinalized, hard_delete_finalized: hardDeleteFinalized },
      finished_at: new Date(),
    }).where(eq(cronRuns.id, runId));

    return NextResponse.json({ ok: true, cancel_finalized: cancelFinalized, past_due_finalized: pastDueFinalized, hard_delete_finalized: hardDeleteFinalized });
  } catch (err) {
    await db.update(cronRuns).set({
      status: "failed",
      error_message: String(err),
      finished_at: new Date(),
    }).where(eq(cronRuns.id, runId));

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
