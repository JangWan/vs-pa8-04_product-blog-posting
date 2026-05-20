// Toss API 요청 래퍼 — 모든 Toss 호출 반드시 이 함수 경유 (BR-35-d)
// fetch 직접 사용 금지: payment_logs 누락 시 PG 분쟁 증빙 불가

import { db } from "@/db";
import { paymentLogs } from "@/db/schema";

const TOSS_BASE_URL = "https://api.tosspayments.com/v1";

function getTossAuthHeader(): string {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error("TOSS_SECRET_KEY is not set");
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

// 민감 필드 마스킹: 빌링키(평문)·authKey(일회성 코드) 로그 저장 금지
function maskRequestBody(body: object): object {
  const rec = body as Record<string, unknown>;
  if (!("authKey" in rec) && !("billingKey" in rec)) return body;
  return {
    ...rec,
    ...(rec.authKey !== undefined && { authKey: "***" }),
    ...(rec.billingKey !== undefined && { billingKey: "***" }),
  };
}

function maskResponseBody(data: Record<string, unknown>): Record<string, unknown> {
  if (!("billingKey" in data)) return data;
  return { ...data, billingKey: "***" };
}

interface TossRequestOptions {
  orderId?: string;
  type: string;
}

interface TossResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

export async function tossRequest<T = unknown>(
  method: string,
  path: string,
  body?: object,
  context?: TossRequestOptions
): Promise<TossResponse<T>> {
  const { orderId, type } = context ?? { type: "UNKNOWN" };
  const safeReqBody = body ? maskRequestBody(body) : null;

  // 1) REQ 로그 (민감 필드 마스킹 후 저장)
  await db.insert(paymentLogs).values({
    id: crypto.randomUUID(),
    order_id: orderId ?? null,
    type: `${type}_REQ`,
    request_body: safeReqBody,
  });

  try {
    const response = await fetch(`${TOSS_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: getTossAuthHeader(),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as T & { code?: string; message?: string };
    const safeResBody = maskResponseBody(data as Record<string, unknown>);

    // 2) RES 로그 (billingKey 마스킹 후 저장)
    await db.insert(paymentLogs).values({
      id: crypto.randomUUID(),
      order_id: orderId ?? null,
      type: `${type}_RES`,
      request_body: safeReqBody,
      response_body: safeResBody,
      status_code: response.status,
      error_code: (data as { code?: string }).code ?? null,
      error_message: (data as { message?: string }).message ?? null,
    });

    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    // 3) ERR 로그 (네트워크 오류)
    await db.insert(paymentLogs).values({
      id: crypto.randomUUID(),
      order_id: orderId ?? null,
      type: `${type}_ERR`,
      request_body: safeReqBody,
      error_message: String(err),
    });
    throw err;
  }
}
