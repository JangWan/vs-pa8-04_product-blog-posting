# 일반결제 → 자동결제(빌링) 전환 설계 문서

> 작성일: 2026-05-18 | 참조: docs/Imple/progress-status-09.결제.md · Toss Payments 빌링 API v2

---

## 1. 전환 배경 및 핵심 버그

### 기존 구현 (일반결제) 의 치명적 결함

```
requestPayment({ method: "CARD", ... })   ← 일반 카드 결제
→ /payments/confirm → rawData.billingKey = null  ← billingKey 절대 없음
→ activateSubscription(): billing_key_encrypted = null  ← 정기결제 cron 영구 실패
```

**결론:** 기존 구현은 정기결제가 구조적으로 불가능한 상태였음.

---

## 2. 올바른 자동결제(빌링) 흐름

### 2-1. 결제창 방식 — requestBillingAuth

```
requestBillingAuth({ customerKey, successUrl: ...?orderId=xxx, failUrl })
  → 토스 카드 등록창 (청구 없음)
  → successUrl: ?authKey=xxx&customerKey=xxx&orderId=xxx (orderId 미리 심음)
서버: POST /billing/authorizations/issue { authKey, customerKey } → billingKey
서버: POST /billing/{billingKey} { customerKey, orderId, amount, ... } → paymentKey
서버: billingKey 암호화 저장 + subscription 활성화 + usage_quotas 초기화
```

### 2-2. 정기결제 (cron — 기존 유지)

```
매일 02:00 KST: next_billing_at 도래한 구독 조회
→ billingKey 복호화
→ POST /billing/{billingKey} → 청구
```

### 2-3. 즉시 취소 (서비스 미사용 시)

```
조건: sub.status=active AND usage 모두 0 (generations/translations/agent_runs)
→ POST /v1/payments/{paymentKey}/cancel { cancelReason } → 전액 취소
→ orders.status → PAY_CANCELED
→ subscriptions → status=canceled, billing_key_encrypted=null
→ organizations → plan=free
```

---

## 3. DB 스키마 변경: 없음

기존 테이블이 이미 빌링을 위해 설계되어 있었음.

| 테이블 | 컬럼 | 기존 값 | 변경 후 값 |
|--------|------|---------|-----------|
| subscriptions | billing_key_encrypted | 항상 NULL (버그) | AES-256-GCM 암호화 billingKey |
| orders | status 흐름 | ORDER→AUTH_READY→AUTH_SUCCESS→confirm→PAY_SUCCESS | ORDER→AUTH_READY→(activate)→PAY_SUCCESS |
| payments | payment_key | /payments/confirm 응답 | /billing/{billingKey} 응답 |

---

## 4. 주문 상태 흐름 변화

### 기존 (일반결제)
```
ORDER → AUTH_READY → AUTH_SUCCESS (client: paymentKey받음) → confirm(API) → PAY_SUCCESS
```

### 신규 (자동결제/빌링)
```
ORDER → AUTH_READY (빌링창 열기 전) → [client: activate 호출]
  서버 내부: AUTH_SUCCESS(기록) → billingKey발급 → 즉시청구 → PAY_SUCCESS
AUTH_CANCEL / AUTH_FAIL: 기존과 동일 (client에서 PATCH /status)
```

**핵심:** `AUTH_SUCCESS`는 이제 서버가 내부적으로 기록 (클라이언트가 별도 PATCH 불필요).

---

## 5. API 엔드포인트 변경

### 삭제
- `POST /api/billing/orders/:orderId/confirm` (paymentKey 기반)

### 추가
- `POST /api/billing/orders/:orderId/activate` — authKey+customerKey → billingKey발급+즉시결제 원자적 처리
- `POST /api/billing/subscription/cancel-immediate` — 서비스 미사용 즉시 환불 취소

### 변경 없음
- `PATCH /api/billing/orders/:orderId/status` — AUTH_CANCEL, AUTH_FAIL 전환에 여전히 필요

---

## 6. constants.ts 변경

```typescript
// 추가: activate API 진입 가드 (ORDER, AUTH_READY 허용)
export const ACTIVATABLE_STATUSES: OrderStatus[] = [
  ORDER_STATUS.ORDER,
  ORDER_STATUS.AUTH_READY,
];
```

---

## 7. service.ts 변경

### 삭제
- `confirmTossPayment()` — /payments/confirm 기반

### 추가
- `issueBillingKeyAndCharge(authKey, customerKey, orderId)` — 빌링키 발급 + 즉시 결제
- 내부 호출: `POST /v1/billing/authorizations/issue` → `POST /v1/billing/{billingKey}`

### 수정
- `activateSubscription(orderId, billingKey)` — billingKey 파라미터 필수화 (rawData 추출 제거)

---

## 8. 프론트엔드 변경

### checkout/page.tsx
```typescript
// 변경 전
requestPayment({ method: "CARD", orderId, amount, successUrl, failUrl })

// 변경 후 — 카드 등록만, 청구 없음
requestBillingAuth({
  customerKey,
  successUrl: `${appUrl}/billing/checkout/result?orderId=${orderId}`,
  failUrl: `${appUrl}/billing/checkout/result?orderId=${orderId}`,
})
```

### checkout/result/page.tsx
```typescript
// 변경 전: paymentKey + orderId
// 변경 후: authKey + customerKey + orderId (orderId는 URL에 미리 심음)
await activateOrder.mutateAsync({ authKey, customerKey, orderId })
```

### billing/page.tsx (즉시 취소 버튼 추가)
```typescript
const canCancelImmediately =
  sub?.status === 'active' &&
  !sub?.cancel_scheduled_at &&
  usage?.generations_used === 0 &&
  usage?.translations_used === 0 &&
  usage?.agent_runs_used === 0;
```

---

## 9. 즉시 취소 (cancel-immediate) 상세 흐름

```
POST /api/billing/subscription/cancel-immediate

1. subscription 조회 → status=active 확인
2. 현재 달 usage_quotas 조회 → 모두 0 확인
3. 가장 최근 PAY_SUCCESS 주문 조회 → payments에서 paymentKey 조회
4. tossRequest POST /payments/{paymentKey}/cancel { cancelReason: "구독 미사용 취소" }
5. 성공 시:
   a. orders.status → PAY_CANCELED
   b. payment_cancels 기록
   c. subscriptions → status=canceled, billing_key_encrypted=null, canceled_at=now()
   d. organizations → plan=free
```

---

## 10. 구현 진행 상태

| # | 항목 | 상태 |
|---|------|------|
| 10-01 | 설계 문서 작성 | ✅ |
| 10-02 | constants.ts — ACTIVATABLE_STATUSES 추가 | ✅ |
| 10-03 | service.ts — issueBillingKeyAndCharge + activateSubscription 수정 | ✅ |
| 10-04 | route.ts — /activate 추가, /confirm 삭제, /cancel-immediate 추가 | ✅ |
| 10-05 | use-billing.ts — useActivateOrder + useCancelImmediateSubscription | ✅ |
| 10-06 | checkout/page.tsx — requestBillingAuth 전환 | ✅ |
| 10-07 | checkout/result/page.tsx — authKey+customerKey 처리 | ✅ |
| 10-08 | billing/page.tsx — 즉시 취소 버튼 | ✅ |
