// 만료 주문 PAY_EXPIRED 처리 cron (개발 15분, 운영 5분)

import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { db } from "@/db";
import { orders, orderStatusHistory, webhookEvents, cronRuns } from "@/db/schema";
import { and, eq, inArray, lt, isNotNull } from "drizzle-orm";
import { ORDER_STATUS } from "@/features/billing/backend/constants";

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
    cron_code: "billing/expire-orders",
    qstash_message_id: messageId,
    triggered_by: "schedule",
    status: "running",
  });

  let expired = 0;

  try {
    const now = new Date();
    const expiredOrders = await db.select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(
        inArray(orders.status, [ORDER_STATUS.AUTH_READY, ORDER_STATUS.AUTH_SUCCESS]),
        lt(orders.expires_at, now),
        isNotNull(orders.expires_at)
      ));

    for (const order of expiredOrders) {
      await db.batch([
        db.update(orders).set({ status: ORDER_STATUS.PAY_EXPIRED }).where(eq(orders.id, order.id)),
        db.insert(orderStatusHistory).values({
          id: crypto.randomUUID(),
          order_id: order.id,
          from_status: order.status,
          to_status: ORDER_STATUS.PAY_EXPIRED,
          changed_by: "cron",
          reason: "expires_at_exceeded",
        }),
      ]);
      expired++;
    }

    await db.insert(webhookEvents).values({
      id: crypto.randomUUID(),
      event_id: messageId,
      provider: "qstash",
      event_type: "billing/expire-orders",
      payload: { expired } as Record<string, unknown>,
    });

    await db.update(cronRuns).set({
      status: "completed",
      result_summary: { expired },
      finished_at: new Date(),
    }).where(eq(cronRuns.id, runId));

    return NextResponse.json({ ok: true, expired });
  } catch (err) {
    await db.update(cronRuns).set({
      status: "failed",
      error_message: String(err),
      finished_at: new Date(),
    }).where(eq(cronRuns.id, runId));

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
