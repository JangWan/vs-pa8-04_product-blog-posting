// Toss Payments Webhook 핸들러 (UC-33)
// 항상 200 응답 필수 — 5xx 시 Toss 지수 백오프 재시도 → 중복 처리 위험 (BR-37)
// webhook_events.event_id UNIQUE 멱등성 처리

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncTossPaymentStatus } from "@/features/billing/backend/service";

export async function POST(req: NextRequest) {
  let body: { eventId?: string; eventType?: string; data?: { orderId?: string } } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { eventId, eventType, data } = body;
  if (!eventId) return NextResponse.json({ ok: true }, { status: 200 });

  try {
    // 멱등성: 동일 eventId 재수신 시 즉시 200
    const [existing] = await db.select({ id: webhookEvents.id })
      .from(webhookEvents).where(eq(webhookEvents.event_id, eventId));

    if (existing) return NextResponse.json({ ok: true }, { status: 200 });

    // 이벤트 처리
    if (eventType === "VIRTUAL_ACCOUNT_DEPOSIT_CALLBACK" && data?.orderId) {
      await syncTossPaymentStatus(data.orderId);
    }

    await db.insert(webhookEvents).values({
      id: crypto.randomUUID(),
      event_id: eventId,
      provider: "toss",
      event_type: eventType ?? "unknown",
      payload: body as Record<string, unknown>,
    });
  } catch {
    // 내부 오류도 200 반환 (BR-37 §5-6)
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
