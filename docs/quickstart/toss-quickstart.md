# Toss Payments 결제 연동 설계 가이드

> **기준**: `@tosspayments/tosspayments-sdk` v2.7+ / Toss API `2024-06-01`  
> **작성일**: 2026-05-17
>
> 이 문서는 Toss 결제를 **처음부터 올바르게 설계·구현하기 위한 가이드**다.  
> Toss 공식 API·SDK 상세 → [`docs/tech/toss.md`](../tech/toss.md)

---

## SSOT 구조

| 문서 | 역할 |
|---|---|
| `docs/tech/toss.md` | Toss 공식 API·SDK 레퍼런스 (원본) |
| **이 문서** | Toss 기반 결제 연동 설계·구현 가이드 (원본) |
| `docs/usecase/결제.md` | 비즈니스 플로우·에러 시나리오 명세 (파생) |

---

## 핵심 보안 원칙

> **"PG가 결제했다고 알려준 금액을 절대 신뢰하지 않는다"**

| # | 원칙 | 위반 시 |
|---|------|--------|
| 1 | **DB 주문 행을 먼저 생성한 뒤** Toss 결제창 호출 | orderId 임시값이면 confirm 단계에서 검증 불가 |
| 2 | **서버가 DB의 `totalAmount`를 사용**하여 confirm 호출 — 클라이언트 amount 무시 | 클라이언트 금액 조작 가능 (1원 결제로 100만원 상품 구매) |
| 3 | confirm 가능 상태는 **`AUTH_SUCCESS` 뿐** — 상태 가드 필수 | 중복 승인 / 잘못된 상태 승인 |
| 4 | 모든 Toss 요청·응답·에러는 **감사 로그**에 기록 — 전용 래퍼 강제 | PG 분쟁 시 증빙 불가 |
| 5 | `customerKey`는 **사용자별 1회 생성된 UUID**를 재사용 (orderId나 이메일 사용 금지) | Toss 정책 위반, 브랜드페이 연속성 깨짐 |

---

## 내부 주문 상태 설계

Toss는 8개 공식 상태를 제공한다 → [`toss.md > Toss 결제 상태`](../tech/toss.md).  
실제 서비스에서는 **Toss 상태 + 내부 비즈니스 흐름**을 커버하는 확장 상태가 필요하다.

### 11개 내부 상태 (권장)

| 내부 상태 | 설명 | 매핑되는 Toss 상태 |
|---|---|---|
| `ORDER` | 주문 행 생성 직후 — Toss 미등록 | — |
| `AUTH_READY` | `requestPayment()` 호출 직전 | `READY` |
| `AUTH_SUCCESS` | successUrl 도착 (confirm 대기) | `IN_PROGRESS` |
| `AUTH_CANCEL` | 사용자가 결제창 닫음 | — |
| `AUTH_FAIL` | 인증 실패 / 결제창 예외 | — |
| `PAY_SUCCESS` | 승인 완료 (최종) | `DONE` |
| `PAY_FAIL` | 승인 실패 | `ABORTED` |
| `PAY_WAITING` | 가상계좌 입금 대기 | `WAITING_FOR_DEPOSIT` |
| `PAY_EXPIRED` | 만료 (expiresAt 초과) | `EXPIRED` |
| `PAY_CANCELED` | 전액 취소 | `CANCELED` |
| `PAY_CANCELED_PARTIAL` | 부분 취소 (잔액 있음) | `PARTIAL_CANCELED` |

### 상태 전환 흐름

```
              ┌──> AUTH_CANCEL          (사용자 결제창 닫음)
              │
ORDER ──> AUTH_READY ──> [Toss 결제창]
                              │
                              ├──> successUrl → AUTH_SUCCESS ──> [confirm API]
                              │                                       │
                              │                                       ├──> PAY_SUCCESS
                              │                                       ├──> PAY_WAITING (가상계좌)
                              │                                       └──> PAY_FAIL
                              │
                              └──> failUrl    → AUTH_FAIL / AUTH_CANCEL

PAY_SUCCESS ──> [cancel API] ──> PAY_CANCELED / PAY_CANCELED_PARTIAL

AUTH_READY / AUTH_SUCCESS ──> PAY_EXPIRED  (expiresAt 초과 → cron 처리)
```

### 상태 가드 화이트리스트

코드에서 상수로 정의하고 모든 가드 로직이 이 상수를 참조해야 한다.

| 상수명 | 허용 상태 | 용도 |
|---|---|---|
| `CLIENT_TRANSITION_STATUSES` | `AUTH_READY`, `AUTH_SUCCESS`, `AUTH_CANCEL`, `AUTH_FAIL` | 클라이언트가 전환 요청할 수 있는 상태 (`AUTH_*` 4종만) |
| `CONFIRMABLE_STATUSES` | `AUTH_SUCCESS` | confirm API 진입 가드 |
| `CANCELED_STATUSES` | `PAY_SUCCESS`, `PAY_CANCELED_PARTIAL` | cancel API 진입 가드 (부분 취소 후 재취소 포함) |
| `AUTO_SYNC_STATUSES` | `AUTH_SUCCESS` | 페이지 진입 시 Toss와 자동 동기화 대상 |
| `PAID_STATUSES` | `PAY_SUCCESS`, `PAY_CANCELED_PARTIAL` | 콘텐츠 접근 허용 (부분 취소 후에도 잔액 있음) |

> ⚠️ `PAY_*` 상태는 **서버 전용** — 클라이언트가 직접 전환할 수 없도록 `CLIENT_TRANSITION_STATUSES` 가드 필수

---

## DB 스키마 설계

### 핵심 결정 사항

| 결정 | 이유 |
|---|---|
| `orders.id`, `payments.paymentKey`는 `VARCHAR(64)` | Toss가 정한 orderId 형식 — uuid 타입 사용 불가 |
| `orders.status VARCHAR(50)` | 11개 내부 상태 코드 길이 여유 |
| `orders.expiresAt TIMESTAMPTZ` | 주문 생성 시 `+30분` 설정 → cron으로 만료 처리 (Toss 공식 제한 10분보다 보수적) |
| `users.payment_customer_key VARCHAR(300) UNIQUE` | Toss customerKey 영구 보관, 사용자당 1개 |
| `order_items.usedQuantity` | 콘텐츠 복사/다운로드 시 증가 — 환불 가능 수량 제한 |
| `payments.rawData JSONB` | Toss Payment 객체 전체 보관 (영수증 URL 등 사후 조회용) |
| `payment_logs` 테이블 | **모든** Toss 요청/응답/에러 기록 — 분쟁·감사 증빙용 |

### 테이블 요약

| 테이블 | 핵심 컬럼 | 역할 |
|---|---|---|
| `orders` | `id` (varchar64), `status`, `totalAmount`, `expiresAt` | 주문. **id = Toss orderId (UUID 문자열)** |
| `order_items` | `quantity`, `cancelledQuantity`, `usedQuantity`, `unitPrice` | 상품별 라인 |
| `order_status_history` | `fromStatus`, `toStatus`, `changedBy`, `reason` | 상태 변경 이력 (감사) |
| `payments` | `paymentKey`, `method`, `status`, `amount`, `approvedAt`, `rawData` (jsonb) | Toss Payment 객체 보관 |
| `payment_logs` | `type` (CONFIRM_REQ/RES/ERR …), `requestBody`, `responseBody`, `statusCode`, `errorCode` | 모든 Toss 요청/응답 감사 로그 |
| `payment_cancel_requests` | `status` (PENDING/APPROVED/REJECTED), `requestedItems` (jsonb) | 사용자 취소 요청 |
| `payment_cancels` | `amount`, `transactionKey`, `rawData` | Toss 취소 API 결과 |
| `payment_error_codes` | `pgProvider`, `errorCode`, `displayMessage`, `actionType` | 에러 코드 → 사용자 표시 메시지 매핑 |

---

## 아키텍처 계층 설계

프레임워크에 무관한 **책임 분리** 원칙이다. 계층별 구현체는 프레임워크에 따라 다르다.

```
[클라이언트 레이어]
   ├─ Toss SDK: loadTossPayments() + payment.requestPayment()
   └─ 결제 UI (주문 폼, 결제 결과 페이지)

        ↓ 서버 호출
        (Next.js: Server Action / Hono·Express: Route Handler / tRPC: Procedure)

[서버 처리 레이어]   ← 인증·인가 검증 + 비즈니스 흐름 조율
   ├─ createOrder            : 주문 행 생성 + expiresAt 설정
   ├─ updateOrderStatus      : CLIENT_TRANSITION_STATUSES 가드 (AUTH_* 4종만)
   ├─ confirmPayment         : Toss confirm 호출 + 캐시 갱신
   ├─ syncPaymentStatus      : AUTH_SUCCESS 페이지 진입 시 폴백 동기화
   ├─ requestCancel          : 사용자 취소 요청 (PENDING)
   ├─ approveCancel          : 관리자 승인 + Toss cancel 집행
   └─ deleteOrder            : ORDER 상태 주문만 삭제 허용

        ↓

[서비스 레이어]   ← Toss API 통신 책임
   ├─ tossRequest()              : 감사 로그 자동 기록 래퍼 (모든 Toss 호출 필수 경유)
   ├─ confirmTossPayment         : 상태 가드 + DB amount 사용
   ├─ cancelTossPayment          : 전액/부분 취소
   └─ syncTossPaymentStatus      : Toss 상태 조회·동기화

        ↓

[데이터 접근 레이어 (DAL)]   ← 모든 DB 쿼리 집중
   ├─ upsertPayment / updateOrderStatus / processCancelApproval
   └─ createPaymentLog (감사 로그)

        ↓

[DB] (ORM 종류 무관)
```

> ⚠️ 클라이언트와 서버 처리 레이어는 DB에 직접 접근하지 않는다. DAL을 통한다.

---

## customerKey 영구 관리

```typescript
// 사용자별 customerKey 조회 또는 최초 생성
async function getOrCreatePaymentCustomerKey(userId: string): Promise<string> {
  const existing = await dal.findCustomerKey(userId);
  if (existing) return existing;

  const key = uuidv4(); // UUID v4 필수
  await dal.saveCustomerKey(userId, key);
  return key;
}
```

- `users.payment_customer_key`는 `VARCHAR(300) UNIQUE`
- 사용자당 영구 1회 발급, 모든 결제에서 재사용
- ❌ `customerKey = orderId` — 주문마다 바뀌므로 브랜드페이 연속성 깨짐
- ❌ `customerKey = email` — Toss 정책 위반 (추측 가능)

---

## Toss API 요청 래퍼 (감사 로그 자동화)

> ⚠️ **모든 Toss API 호출은 이 래퍼를 경유해야 한다.** `fetch` 직접 호출 금지 — `payment_logs` 누락 시 PG 분쟁 증빙 불가.

```typescript
async function tossRequest(
  method: string,
  path: string,
  body?: object,
  context?: { orderId?: string; type: string }
) {
  const { orderId, type } = context ?? {};

  // 1) REQ 로그
  await createPaymentLog({ orderId, type: `${type}_REQ`, requestBody: body });

  try {
    const response = await fetch(`https://api.tosspayments.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();

    // 2) RES 로그
    await createPaymentLog({
      orderId, type: `${type}_RES`,
      requestBody: body, responseBody: data,
      statusCode: response.status,
      errorCode: data.code, errorMessage: data.message,
    });

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    // 3) ERR 로그 (네트워크 에러)
    await createPaymentLog({ orderId, type: `${type}_ERR`, requestBody: body, errorMessage: String(error) });
    throw error;
  }
}
```

---

## 결제 승인 구현 패턴

```typescript
async function confirmTossPayment(paymentKey: string, orderId: string) {
  const order = await dal.getOrderForConfirm(orderId);

  // ① 존재 + 상태 가드 (AUTH_SUCCESS만 허용)
  if (!order) return { success: false, code: "ORDER_NOT_FOUND" };
  if (order.status !== "AUTH_SUCCESS") {
    return { success: false, code: "INVALID_ORDER_STATUS" };
  }

  // ② 금액은 DB값 사용 — 클라이언트 amount 절대 신뢰 금지
  const amount = Number(order.totalAmount);

  // ③ tossRequest 래퍼 경유 (감사 로그 자동 기록)
  const result = await tossRequest(
    "POST", "/payments/confirm",
    { paymentKey, orderId, amount },
    { orderId, type: "CONFIRM" }
  );

  if (result.ok) {
    const paymentData = result.data;

    // ④ payments 행 upsert
    await dal.upsertPayment({ paymentKey, rawData: paymentData });

    // ⑤ 가상계좌(WAITING_FOR_DEPOSIT)는 PAY_WAITING, 나머지는 PAY_SUCCESS
    const targetStatus = TOSS_STATUS_MAP[paymentData.status] ?? "PAY_SUCCESS";
    await dal.updateOrderStatus(orderId, targetStatus);

    // ⑥ 실제 결제 완료(PAY_SUCCESS)시에만 후처리 (장바구니 정리 등)
    if (targetStatus === "PAY_SUCCESS") {
      await postPaymentSuccessHandler(order.userId, orderId);
    }
  } else {
    await dal.updateOrderStatus(orderId, "PAY_FAIL");
  }
}
```

---

## 환불 금액 계산

```
환불액 = unitPrice × (quantity - usedQuantity - cancelledQuantity) × 0.9   // 수수료 10%
       → KRW: Math.floor (소수점 절사)
```

- `usedQuantity`: 콘텐츠 복사/다운로드 시 증가 — 사용한 수량은 환불 불가
- `cancelledQuantity`: 이미 취소된 수량

```typescript
function calculateRefundAmount(
  unitPrice: number,
  quantity: number,
  usedQuantity: number,
  cancelledQuantity: number
): number {
  const refundableQty = quantity - usedQuantity - cancelledQuantity;
  return Math.floor(unitPrice * refundableQty * 0.9);
}
```

### 취소 트랜잭션 (관리자 승인 흐름)

```
PENDING 취소요청 → 관리자 승인 → Toss cancel API 호출
                                       │
                                       ▼
                       단일 트랜잭션 안에서:
                         ├─ payment_cancels 행 insert
                         ├─ payment_cancel_requests.status = APPROVED
                         ├─ payments.status = CANCELED | PARTIAL_CANCELED
                         ├─ orders.status   = PAY_CANCELED | PAY_CANCELED_PARTIAL
                         └─ order_status_history insert
```

---

## 상태 동기화 구현 패턴 (폴백)

사용자가 결제 인증 후 브라우저를 닫거나 새로고침하면 `confirmPayment`가 호출되지 않아 `AUTH_SUCCESS`에 멈춘다. 페이지 진입 시 자동으로 Toss 상태를 조회·보정한다.

```typescript
async function syncTossPaymentStatus(orderId: string) {
  const order = await dal.getOrder(orderId);

  // Toss 미등록 상태 — API 호출 스킵
  if (order.status === "ORDER") return "ORDER";

  const result = await tossRequest(
    "GET", `/payments/orders/${orderId}`,
    undefined, { orderId, type: "SYNC" }
  );

  if (result.ok) {
    const targetStatus = TOSS_STATUS_MAP[result.data.status] ?? "PAY_SUCCESS";
    await dal.upsertPayment({ rawData: result.data });
    await dal.updateOrderStatus(orderId, targetStatus);
    return targetStatus;
  } else if (result.status === 404) {
    // 만료 확인: expiresAt 초과 + AUTO_SYNC_STATUSES 에 해당하면 PAY_EXPIRED
    if (isExpired(order.expiresAt) && AUTO_SYNC_STATUSES.includes(order.status)) {
      await dal.updateOrderStatus(orderId, "PAY_EXPIRED");
      return "PAY_EXPIRED";
    }
  }
}
```

---

## Webhook 핸들러 구현 패턴

```typescript
// POST /api/webhooks/toss (프레임워크에 맞는 라우트 경로 사용)
async function handleTossWebhook(req: Request) {
  const body = await req.json();

  // 멱등성: 동일 eventId 재수신 시 즉시 200 응답
  if (await dal.isEventProcessed(body.eventId)) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  try {
    // syncTossPaymentStatus 재사용으로 코드 중복 방지
    await syncTossPaymentStatus(body.data.orderId);
    await dal.markEventProcessed(body.eventId);
  } catch (error) {
    // 내부 오류도 200 반환 — 큐에 적재하여 재처리
    await enqueueForRetry(body);
  }

  // 항상 200 반환 — 5xx 시 Toss 지수 백오프 재시도 → 중복 처리 위험
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
```

> ⚠️ Webhook 엔드포인트는 인증 미들웨어(Clerk 등)가 차단하지 않도록 **public 경로로 등록** 필수

---

## 결제 만료 처리 (cron)

```sql
-- expiresAt 초과 + PAY_* 미도달 주문을 PAY_EXPIRED로 (5분마다 실행)
UPDATE orders
SET status = 'PAY_EXPIRED'
WHERE status IN ('AUTH_READY', 'AUTH_SUCCESS')
  AND expires_at < NOW();
```

- 사용 환경에 맞는 cron 사용: pg_cron, Lambda EventBridge, Cloud Scheduler 등
- 상태 변경 이력은 `order_status_history`에 함께 기록 권장

---

## 결제 UI 플로우 설계

### 주문 페이지 흐름

```
결제 버튼 클릭
  │
  ├─ 1. createOrder(items, totalPrice)            → orderId (ORDER 상태)
  ├─ 2. updateOrderStatus(orderId, AUTH_READY)
  ├─ 3. loadTossPayments(CLIENT_KEY)
  │     → payment({ customerKey })
  │     → payment.requestPayment({ orderId, amount, successUrl, failUrl, ... })
  │
  ├─ [인증 성공] → successUrl로 리다이렉트 (이후 코드 실행 안 됨)
  │
  └─ [실패/취소] catch(error)
       ├─ error.code === "USER_CANCEL" → updateOrderStatus(orderId, AUTH_CANCEL)
       └─ 그 외                        → updateOrderStatus(orderId, AUTH_FAIL, error.message)

취소 버튼 (ORDER 상태):
  └─ deleteOrder(orderId) — 고아 주문 DB 누적 방지
```

### 결제 결과 페이지 (successUrl / failUrl 단일 URL 권장)

successUrl과 failUrl을 **동일한 URL**로 설정하고 쿼리 파라미터로 분기한다. 라우트 1개로 4가지 케이스를 처리한다.

```
쿼리 파라미터로 케이스 분류:
  paymentKey + orderId + amount  → 인증 성공 → confirm 진행
  code + message + orderId       → 인증 실패 또는 사용자 취소
  둘 다 없음                     → 직접 접근 → 주문 목록으로 redirect

[인증 성공]
  1. updateOrderStatus(orderId, AUTH_SUCCESS)
  2. confirmPayment(paymentKey, orderId)
     ├─ 성공 → returnUrl 또는 주문 내역으로 이동
     └─ 실패 → 에러 메시지 표시

[인증 실패]
  1. isCancel = (code === "PAY_PROCESS_CANCELED")
  2. updateOrderStatus(orderId, isCancel ? AUTH_CANCEL : AUTH_FAIL, message)
  3. "다시 시도" / "주문 내역" 버튼 노출
```

> ⚠️ confirm 호출은 **정확히 1회**만 실행 — 중복 호출 시 `INVALID_ORDER_STATUS` 에러  
> ⚠️ React 기반 프레임워크에서는 `useEffect(..., [])` deps 배열 주의 (StrictMode 2회 실행 대비)

---

## 자주 하는 실수 체크리스트

- [ ] 클라이언트 amount를 그대로 confirm에 전달 ❌ → DB `totalAmount` 사용
- [ ] `confirmTossPayment` 상태 가드 누락 → `AUTH_SUCCESS`만 허용
- [ ] Toss 호출을 `fetch` 직접 사용 → `tossRequest()` 래퍼 경유 (감사 로그)
- [ ] `customerKey`로 orderId/이메일 사용 → UUID + 영구 저장
- [ ] `WAITING_FOR_DEPOSIT`을 결제 완료로 처리 → `TOSS_STATUS_MAP` 분기, `DONE`(PAY_SUCCESS)만 후처리
- [ ] confirm 중복 호출 → 결과 페이지에서 정확히 1회 실행 보장
- [ ] successUrl/failUrl 별도 라우트로 분리 → 단일 URL + 쿼리 분기 권장
- [ ] `orders.id`를 uuid 타입으로 정의 → `varchar(64)` 문자열
- [ ] expiresAt 미설정 → 주문 생성 시 +30분 설정, cron으로 만료 처리
- [ ] 부분 취소 후 잔액 추가 취소 불가 → `CANCELED_STATUSES`에 `PAY_CANCELED_PARTIAL` 포함
- [ ] 환불액 `Math.floor` 미적용 → KRW 정수 단위 오류
- [ ] 환불 계산 시 `usedQuantity` 미반영
- [ ] Webhook이 500 반환 → 항상 200 응답 + 내부 큐 재처리
- [ ] Webhook 멱등성 미처리 → `eventId` 기록으로 중복 처리 방지
- [ ] Webhook 엔드포인트가 인증 미들웨어에 차단 → public 경로 등록

---

## 구현 완료 체크리스트

### 기반 설정
- [ ] `@tosspayments/tosspayments-sdk` 설치
- [ ] 환경변수: 클라이언트 키 (공개), 서버 시크릿 키 (서버 전용)
- [ ] 환경변수 스키마 검증 등록 (`z.string().min(1)`)
- [ ] 11개 내부 상태 + 상태 가드 화이트리스트 상수 파일 작성

### DB
- [ ] `orders` / `order_items` / `order_status_history` — id는 `varchar(64)`
- [ ] `payments` / `payment_logs` / `payment_cancel_requests` / `payment_cancels` / `payment_error_codes`
- [ ] `users.payment_customer_key VARCHAR(300) UNIQUE`
- [ ] `orders.expiresAt TIMESTAMPTZ` + cron으로 만료 처리

### 서비스 레이어
- [ ] `tossRequest()` 래퍼 — REQ/RES/ERR 3종 감사 로그 자동 기록
- [ ] `confirmTossPayment` — `AUTH_SUCCESS` 가드 + DB `totalAmount` 사용
- [ ] `cancelTossPayment` — 부분 취소 지원
- [ ] `syncTossPaymentStatus` — `ORDER` 상태는 API 호출 스킵
- [ ] `getOrCreatePaymentCustomerKey` — UUID v4 영구 발급

### 서버 처리 레이어
- [ ] `createOrder` — `ORDER` 상태 + `expiresAt = now + 30분`
- [ ] `updateOrderStatus` — `CLIENT_TRANSITION_STATUSES` 가드
- [ ] `confirmPayment` — 결제 승인 + 캐시/뷰 갱신
- [ ] `syncPaymentStatus` — `AUTH_SUCCESS` 페이지 진입 폴백
- [ ] `requestCancel` — PENDING 중복 차단
- [ ] `approveCancel` — Toss cancel + 단일 트랜잭션 DB 업데이트
- [ ] `deleteOrder` — `ORDER` 상태만 삭제 허용

### UI
- [ ] 주문 페이지: 주문 생성 → `AUTH_READY` → SDK 호출 → catch에서 `AUTH_CANCEL/FAIL`
- [ ] 결제 결과 페이지: 쿼리 분기(성공/실패/직접접근) → `AUTH_SUCCESS` → `confirmPayment`
- [ ] successUrl/failUrl 단일 URL, returnUrl 쿼리 파라미터로 복귀 위치 전달
- [ ] confirm 정확히 1회 실행 보장

### 취소 / 환불
- [ ] 취소 요청 UI: 항목별 수량 + 환불 예상액 실시간 표시
- [ ] 관리자 승인/거절 UI
- [ ] `calculateRefundAmount(unitPrice, quantity, usedQuantity, cancelledQuantity)` — `Math.floor` 적용

### Webhook
- [ ] POST 엔드포인트 — 항상 200 응답
- [ ] `eventId` 멱등성 처리
- [ ] 인증 미들웨어 우회 (public 경로 등록)
- [ ] 가상계좌 입금 이벤트 → `syncTossPaymentStatus` 재사용

---

## 참조 문서

| 문서 | 경로 | 내용 |
|---|---|---|
| Toss API·SDK 레퍼런스 | `docs/tech/toss.md` | 공식 API·상태 enum·에러코드·식별자 제약 |
| 결제 유스케이스 | `docs/usecase/결제.md` | 비즈니스 플로우·에러 시나리오 |
| Toss 개발자센터 | https://docs.tosspayments.com/ | 공식 문서 |
