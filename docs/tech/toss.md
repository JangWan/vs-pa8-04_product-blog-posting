---
description: Toss Payments 공식 API·SDK 레퍼런스 및 주의사항
globs: "**/*toss*,**/payment*"
---

# Toss Payments 공식 API·SDK 레퍼런스

> **기준: 2026년 5월 / @tosspayments/tosspayments-sdk v2.7+ / Toss API version `2024-06-01`**
>
> 이 문서는 **Toss 공식 문서의 내용·해석·주의사항**만 다룬다.  
> 연동 설계·DB 스키마·구현 패턴 → [`docs/quickstart/toss-quickstart.md`](../quickstart/toss-quickstart.md)

---

## 환경변수 (API 키)

```env
# 클라이언트 SDK 초기화용 (공개 가능 — 브라우저 번들에 포함됨)
TOSS_CLIENT_KEY=test_ck_xxxxxxxxxxxx

# 서버 전용 — confirm/cancel/조회 API 인증 (절대 클라이언트 노출 금지)
TOSS_SECRET_KEY=test_sk_xxxxxxxxxxxx
```

> - 운영 키(`live_*`)와 테스트 키(`test_*`)는 **페어로 발급**. 클라이언트와 시크릿 키의 페어가 일치해야 함 — 불일치 시 `UNAUTHORIZED_KEY`.
> - Authorization 헤더: `Basic ${base64("${TOSS_SECRET_KEY}:")}` — **콜론(`:`) 뒤를 빈 문자열**로 두는 것이 Basic Auth 표준. 콜론 누락이 `UNAUTHORIZED_KEY` 1위 원인.
> - 프레임워크마다 환경변수 노출 방식이 다르다. Next.js는 `NEXT_PUBLIC_` 접두사, Vite는 `VITE_` 접두사 등. 클라이언트 키에 해당 규칙 적용 필요.

---

## SDK (클라이언트)

```bash
npm install @tosspayments/tosspayments-sdk
```

```typescript
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

// 1) SDK 로드
const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);

// 2) 결제 인스턴스 생성 (customerKey는 사용자별 고유 식별자)
const payment = tossPayments.payment({ customerKey });

// 3) 결제창 호출
await payment.requestPayment({
  method: "CARD",                            // CARD | TRANSFER | VIRTUAL_ACCOUNT | MOBILE_PHONE | EASY_PAY
  orderId,                                   // 6자 이상 64자 이하, 영문/숫자/-_= 조합
  orderName,                                 // 100자 이내
  amount: { currency: "KRW", value: total }, // 표시용 — confirm 시 서버에서 DB값 사용
  successUrl,                                // 인증 성공 시 리다이렉트 URL
  failUrl,                                   // 인증 실패 / 사용자 취소 시 리다이렉트 URL
  customerEmail,
  customerName,
});
```

### requestPayment() 동작 특성

- Promise는 **항상 resolve되지 않는다** — 인증 성공 시 `successUrl`로 리다이렉트되므로 이후 코드가 실행되지 않음
- 사용자가 결제창을 닫으면 **throw 발생** → `error.code === "USER_CANCEL"` 처리 필수
- `failUrl`에는 사용자 취소(`PAY_PROCESS_CANCELED`)와 시스템 오류 모두 도달

### successUrl / failUrl 쿼리 파라미터

Toss가 리다이렉트 시 자동으로 붙여주는 파라미터:

| 도착 케이스 | Toss가 붙여주는 쿼리 파라미터 |
|---|---|
| 인증 성공 | `paymentKey`, `orderId`, `amount` |
| 인증 실패 / 취소 | `code`, `message`, `orderId` |

---

## 식별자 제약 (Toss 정책)

### orderId

- **6자 이상 64자 이하**, 허용 문자: 영문 / 숫자 / `-` / `_` / `=`
- 한 번 발급 후 변경 불가 — Toss가 내부 결제 세션과 연결하기 때문
- DB 컬럼 타입: **`VARCHAR(64)` 문자열** — `UUID` 타입(GUID) 사용 불가

### customerKey

- **2자 이상 50자 이하**
- UUID 권장
- **사용 금지**: 이메일, 전화번호, 자동증가 ID — 추측 가능한 값은 Toss 정책 위반
- 브랜드페이·자동결제 등 모든 후속 결제 기능에서 **동일 key를 재사용**해야 함

---

## API — 결제 승인

### `POST /v1/payments/confirm`

**Request**
```json
{
  "paymentKey": "...",
  "orderId": "...",
  "amount": 15000
}
```

**Response** (카드 성공 예시)
```json
{
  "version": "2024-06-01",
  "paymentKey": "...",
  "status": "DONE",
  "orderId": "...",
  "orderName": "토스 티셔츠 외 2건",
  "method": "카드",
  "totalAmount": 15000,
  "balanceAmount": 15000,
  "isPartialCancelable": true,
  "approvedAt": "2026-05-01T15:40:49+09:00",
  "card": { "...": "method=카드일 때 포함" },
  "virtualAccount": { "...": "method=가상계좌일 때 포함" },
  "cancels": null,
  "receipt": { "url": "..." }
}
```

> ⚠️ **인증 후 10분 이내 confirm 호출 필수** — 초과 시 `NOT_FOUND_PAYMENT_SESSION`  
> ⚠️ 가상계좌는 confirm 직후 `WAITING_FOR_DEPOSIT` 반환 — `DONE`이 아님에 주의  
> ⚠️ Payment 객체 전체(`rawData`)는 영수증 URL·카드 정보 등 사후 조회를 위해 DB에 저장 권장

---

## API — 결제 취소

### `POST /v1/payments/{paymentKey}/cancel`

**Request**
```json
{
  "cancelReason": "고객 요청",
  "cancelAmount": 5000    // 생략 시 전액 취소, 지정 시 부분 취소
}
```

**Response**
```json
{
  "status": "CANCELED",          // 전액 취소: CANCELED | 부분 취소: PARTIAL_CANCELED
  "balanceAmount": 0,             // 남은 잔액
  "cancels": [
    {
      "cancelAmount": 5000,
      "transactionKey": "...",
      "canceledAt": "2026-05-01T16:00:00+09:00"
    }
  ]
}
```

---

## API — 결제 조회 (by orderId)

### `GET /v1/payments/orders/{orderId}`

- 승인 전 `READY` / `IN_PROGRESS` 상태도 조회 가능
- 존재하지 않거나 만료된 경우 **404** 반환

---

## Toss 결제 상태 (공식 enum)

| status | 의미 |
|---|---|
| `READY` | 결제창 진입 전 (주문 생성) |
| `IN_PROGRESS` | 인증 완료 — confirm 대기 중 |
| `WAITING_FOR_DEPOSIT` | 가상계좌 입금 대기 |
| `DONE` | 결제 완료 (최종) |
| `CANCELED` | 전액 취소 |
| `PARTIAL_CANCELED` | 부분 취소 (잔액 있음) |
| `ABORTED` | 승인 실패 |
| `EXPIRED` | 만료 |

---

## Webhook

Toss는 결제 상태 변경 시 등록된 URL로 POST 이벤트를 발송한다.

### 주요 이벤트 타입

| eventType | 발생 시점 |
|---|---|
| `PAYMENT_STATUS_CHANGED` | 결제 상태 변경 (DONE, CANCELED, ABORTED 등) |
| `VIRTUAL_ACCOUNT_DEPOSIT_CALLBACK` | 가상계좌 입금 완료 |

### Webhook Request Body

```json
{
  "eventId": "ev_unique_id",
  "eventType": "PAYMENT_STATUS_CHANGED",
  "createdAt": "2026-05-01T12:00:00+09:00",
  "data": {
    "paymentKey": "...",
    "orderId": "...",
    "status": "DONE"
  }
}
```

### Webhook 수신 주의사항

- **항상 HTTP 200 응답 필수** — 5xx 반환 시 Toss가 지수 백오프로 재시도 → 중복 처리 위험
- 동일 이벤트가 **중복 전송**될 수 있음 → `eventId` 기반 멱등성 처리 필수
- Toss는 svix가 아닌 **자체 서명** 사용 — IP 화이트리스트 또는 Webhook secret 헤더 검증 권장
- 가상계좌 입금 알림은 Webhook이 사실상 유일한 통지 경로 — 사용자가 결제 직후 이탈하기 때문

---

## 자주 발생하는 에러 코드

| 코드 | 원인 | 해결 |
|---|---|---|
| `NOT_FOUND_PAYMENT_SESSION` | 인증 후 10분 경과 / paymentKey 불일치 | 사전 만료 처리, 사용자에게 재결제 안내 |
| `UNAUTHORIZED_KEY` | 클라이언트/시크릿 키 페어 불일치, base64 콜론 누락 | `Basic base64("SECRET_KEY:")` — 콜론 확인 |
| `FORBIDDEN_REQUEST` | orderId/paymentKey가 최초 요청값과 다름 | DB 원본값 사용 (클라이언트 전달값 신뢰 금지) |
| `PAY_PROCESS_CANCELED` | 사용자가 결제창 닫음 | 사용자 취소 케이스로 별도 분기 처리 |
| `PAY_PROCESS_ABORTED` | 결제 중 시스템 오류 | 에러 메시지 그대로 사용자에게 표시 |
| `REJECT_CARD_COMPANY` | 카드사 거절 (한도/잔액/비밀번호 등) | 카드사 안내 메시지 표시 |

→ 에러 코드 한글 메시지 매핑 설계: [`toss-quickstart.md`](../quickstart/toss-quickstart.md) 참조

---

## References

| 문서 | URL |
|---|---|
| Toss Payments 개발자센터 | https://docs.tosspayments.com/ |
| 결제위젯 SDK (V2, JS) | https://docs.tosspayments.com/sdk/v2/js |
| 결제위젯 연동하기 | https://docs.tosspayments.com/guides/v2/payment-widget |
| 결제 승인 API | https://docs.tosspayments.com/reference#결제-승인 |
| 결제 취소 API | https://docs.tosspayments.com/guides/v2/cancel-payment |
| 결제 조회 by orderId | https://docs.tosspayments.com/reference#orderId로-결제-조회 |
| Webhook 가이드 | https://docs.tosspayments.com/guides/v2/webhook |
| 에러 코드 전체 | https://docs.tosspayments.com/reference/error-codes |
| API 버전 / 릴리즈 노트 | https://docs.tosspayments.com/reference/api-version |
| 테스트 시나리오 (실패 재현) | https://docs.tosspayments.com/reference/test-codes |
| 가상계좌 결제 응답 | https://docs.tosspayments.com/guides/v2/virtual-account |
| 간편결제 응답 확인 | https://docs.tosspayments.com/guides/v2/easy-pay |
