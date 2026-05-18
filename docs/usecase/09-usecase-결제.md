# Usecase — 구독 결제 (Phase 3)
> UC-28~33, UC-38 | 작성일: 2026-05-17 | 최종 갱신: 2026-05-18 (v1.4) | 참조: [PRD.md](../PRD.md) · [IA.md](../IA.md) · [TRD.md](../TRD.md) · [SRS.md](../SRS.md) · [BR-구독결제.md](../BR-구독결제.md) · [usecase-common.md](usecase-common.md) · [`docs/quickstart/toss-quickstart.md`](../quickstart/toss-quickstart.md) · [`docs/tech/toss.md`](../tech/toss.md)

> **v1.4 변경 사항**
> - Team 플랜 제거 (Free/Pro 2종, BR-구독결제.md SSOT)
> - UC-31 '해지 예약' 패턴으로 재작성 (BR-38)
> - **UC-38 '해지 예약 취소' 신규 추가**
> - UC-29 정기결제 시각 09:00 → **02:00 KST** (BR-구독결제.md)
> - cron 인증 Bearer → QStash JWT 서명 검증 + `Upstash-Message-Id` 멱등성 (BR-37)
> - 구독 종료 시 Toss 빌링키 파기 (BR-39)

---

## 1. 개요

| UC | 기능명 | 한 줄 설명 | 관련 URL/액션 |
|----|--------|---------|-------------|
| UC-28 | 신규 구독 결제 | 무료에서 Pro 구독으로 전환. 빌링키 발급도 함께 수행 | `/billing/checkout` → `/billing/checkout/result` |
| UC-29 | 정기결제 자동 청구 | **매일 02:00 KST** QStash Schedule이 next_billing_at 도래한 구독을 빌링키로 자동 결제 | cron — 사용자 인지 없음 |
| UC-30 | 플랜 업/다운그레이드 | Pro 단일 플랜이므로 v1.4에서 호출 사례 없음 (Phase 4 Team 출시 시 활성) | `/billing` |
| UC-31 **(v1.4 재작성)** | 구독 해지 예약 | 즉시 종료 X — `cancel_scheduled_at` 설정, `current_period_end`까지 Pro 사용 (BR-38) | `/billing` → [구독 취소] |
| UC-32 | 환불 요청·승인 | 사용자가 환불 요청 → SystemAdmin 승인 → Toss cancel API 호출 | `/billing/payments/[paymentKey]` |
| UC-33 | 가상계좌 입금 대기·확인 | 카드 외 가상계좌 결제 시 입금 대기 → Webhook으로 자동 활성화 | `/billing/checkout/result` (PAY_WAITING) |
| UC-38 **(v1.4 신규)** | 구독 해지 예약 취소 | `current_period_end` 도래 전이면 언제든 해지 예약을 취소하고 구독 정상화 (BR-38) | `/billing` 해지 예약 카드 → [해지 예약 취소] |

**관련 행위자**: `Admin`, `SystemAdmin` (UC-32 승인), `System` (Toss API · **Upstash QStash Schedule** · Webhook · DB)  
**[PRD](../PRD.md) 매핑**: [추가 제안 기능 §4](../PRD.md#4-추가-제안-기능-향후-로드맵) "구독 결제"  
**[SRS](../SRS.md) 매핑**: §3 BR-32 (플랜별 한도)  
**[TRD](../TRD.md) 매핑**: [§3-3](../TRD.md#3-3-데이터베이스-설계-방향) `orders`·`order_items`·`order_status_history`·`payments`·`payment_logs`·`payment_cancel_requests`·`payment_cancels`·`payment_error_codes`·`subscriptions`·`webhook_events` / [§3-4](../TRD.md#3-4-api-설계) `/api/billing/**` 14개 엔드포인트 + cron 5개 / [§5 보안](../TRD.md#5-보안-요구사항) 결제 보안 원칙

> **결제 핵심 원칙 5가지(BR-35)** 와 **11개 내부 상태 모델**은 [`docs/quickstart/toss-quickstart.md`](../quickstart/toss-quickstart.md)가 SSOT다. 본 문서는 사용자 시나리오만 정의하고, 상태 전환 규칙·DB 스키마·`tossRequest()` 래퍼 등은 quickstart를 따른다.

---

## 2. 사전 조건

- **공통 사전 조건**: [usecase-common.md §5](usecase-common.md#5-공통-사전-조건-common-preconditions) 참조 (PC-01~04)
- **공통 권한**: 모든 결제 액션은 `org:admin`만 가능 (멤버에게는 메뉴 자체가 숨김)
- **UC-28~31**: 활성 조직이 Personal Org가 아니어도 됨 (Personal Org도 유료 플랜 업그레이드 가능, BR-31 정책 — 단 멤버 초대는 여전히 불가)
- **UC-28**: 현재 `organizations.plan='free'` (이미 유료면 UC-30 분기)
- **UC-29 (cron)**: `subscriptions.status='active'` && `next_billing_at <= now()`인 구독 존재
- **UC-30 (upgrade/downgrade)**: 현재 유료 구독 보유. 다운그레이드 시 대상 플랜의 멤버 한도가 현재 멤버 수 이상이어야 함
- **UC-31**: 현재 `subscriptions.status='active'`
- **UC-32 (환불 요청)**: 대상 `payments.status='DONE'` (완료된 결제만 환불 가능)
- **UC-33**: UC-28에서 결제 수단을 가상계좌로 선택한 경우만

---

## 3. 정상 흐름

### UC-28 — 신규 구독 결제 (Free → Pro)

> toss-quickstart §결제 UI 플로우 100% 준수: DB 주문 행 선행 생성 → AUTH_READY → SDK 호출 → 단일 result URL.

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/billing` 진입 → 플랜 비교 테이블에서 [Pro로 업그레이드] 클릭. |
| 2 | 시스템 | `/billing/checkout?plan=pro` 페이지 진입. 주문 요약 카드 표시 (플랜명·월 금액·만료 시각 placeholder). |
| 3 | 시스템 (자동) | `POST /api/billing/orders { plan:'pro', kind:'new_subscription' }`. 서버: ① `users.payment_customer_key` 없으면 UUID v4 발급·저장 (영구) ② orderId(VARCHAR(64), UUID 기반) 생성 ③ `orders` INSERT (`status='ORDER'`, `expires_at=now()+30분`, `customer_key` 캐시) ④ `order_items` + `order_status_history` INSERT (단일 트랜잭션). |
| 4 | 시스템 | 응답: `orderId`·`customerKey`·`amount`·`orderName`·`successUrl`·`failUrl` 수신. successUrl과 failUrl은 동일 — `/billing/checkout/result`. 만료 카운트다운(30분) 시작. |
| 5 | 시스템 (자동) | `PATCH /api/billing/orders/:orderId/status { status:'AUTH_READY' }`. (BR-35-c: CLIENT_TRANSITION_STATUSES 가드 통과) |
| 6 | 시스템 (자동) | `loadTossPayments(TOSS_CLIENT_KEY).payment({ customerKey }).requestPayment({ method:'CARD', orderId, orderName, amount, successUrl, failUrl, customerEmail })` 호출. |
| 7 | `Admin` | Toss 호스팅 결제창에서 카드 정보 입력 → 인증 완료. |
| 8 | 시스템 | Toss가 `successUrl + ?paymentKey=...&orderId=...&amount=...`로 리다이렉트. `/billing/checkout/result` 진입. |
| 9 | 시스템 (자동, 정확히 1회) | useRef 가드 후: ① `PATCH .../status { status:'AUTH_SUCCESS' }` ② `POST /api/billing/orders/:orderId/confirm { paymentKey }`. 서버: order 조회 + 상태 가드(AUTH_SUCCESS만, BR-35-c) → `tossRequest('POST','/payments/confirm', { paymentKey, orderId, amount: order.total_amount })` (BR-35-b: DB amount 사용, BR-35-d: 래퍼 경유로 `payment_logs` 자동 기록). |
| 10 | 시스템 | Toss 응답이 `DONE`이면: ① `orders.status='PAY_SUCCESS'` ② `payments` UPSERT (`raw_data`에 영수증 URL 포함) ③ **빌링키 발급**: `tossRequest('POST', '/billing/authorizations/issue', { ... })` 호출 → 응답 `billingKey`를 AES-256-GCM 암호화하여 `subscriptions.billing_key_encrypted`에 저장 ④ `subscriptions` UPSERT (`plan='pro'`, `status='active'`, `next_billing_at=now()+1개월`, `current_period_end=now()+1개월`) ⑤ `organizations.plan='pro'` UPDATE ⑥ `usage_quotas` 행 갱신 (Pro 한도 적용). |
| 11 | 시스템 | result 페이지에 confetti 애니메이션 + "Pro 플랜이 활성화되었습니다" + 영수증 요약(`payments.raw_data.receipt.url`로 새 창 열기 링크) 표시. "[plan] 플랜이 활성화되었습니다." 토스트. |
| 12 | `Admin` | [대시보드로] 클릭 → `/dashboard` 진입. Sidebar 플랜 뱃지 Pro로 갱신. 사용량 위젯이 Pro 한도 기준으로 갱신. |

### UC-29 — 정기결제 자동 청구 (cron, v1.4 갱신)

> 사용자 인지 없는 백엔드 시나리오. UI에는 결제 성공/실패 결과만 노출. BR-구독결제.md SSOT.

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | Upstash QStash | **매일 02:00 KST** Schedule `/api/cron/billing/tick` 호출 — JWT 서명(`Upstash-Signature`) + `Upstash-Message-Id`. |
| 2 | `System` | Receiver로 서명 검증 → `webhook_events.event_id` UNIQUE 멱등성 체크 (중복 시 즉시 200, BR-37) → `cron_runs` INSERT (status='running'). |
| 3 | `System` | `subscriptions WHERE status='active' AND next_billing_at IS NOT NULL AND next_billing_at <= now()` SELECT FOR UPDATE SKIP LOCKED. (cancel_scheduled_at IS NOT NULL인 구독은 next_billing_at=NULL이므로 자동 제외) |
| 4 | `System` (각 구독) | ① 신규 `orders` INSERT (`kind='recurring'`, `status='AUTH_SUCCESS'` 직행 — 빌링키 결제는 별도 인증 불필요) ② `tossRequest('POST', '/billing/{billingKey_복호화}', { customerKey, amount, orderId, orderName })` 호출 → `payment_logs`에 `RECURRING_CHARGE_REQ/RES/ERR` 자동 기록. |
| 5 | `System` (성공) | `orders.status='PAY_SUCCESS'` + `payments` UPSERT + `subscriptions.next_billing_at += 1개월` + `current_period_end += 1개월`. 사용자에게는 별도 알림 없음. |
| 6 | `System` (일시적 5xx 실패) | 핸들러가 5xx 응답 → **QStash가 메시지 전체를 자동 재시도** (기본 3회 지수 백오프, BR-36 (a)). 일시적 네트워크·Toss 5xx는 자체 복구. |
| 7 | `System` (영구 실패) | 카드 거절·잔액 부족·빌링키 만료 (`REJECT_CARD_COMPANY`·`EXPIRED_CARD` 등) → `orders.status='PAY_FAIL'` + `subscriptions.status='past_due'` + `past_due_since=now()` (BR-36 (b)) + 사용자 이메일 안내 "정기결제 실패 · 3일 내 카드 갱신 필요" + 대시보드·`/billing` 빨강 배너 영구 노출 (admin만). 한도는 유지 (즉시 강등 X). |
| 8 | `System` (3일 grace 경과) | **별도 cron** `/api/cron/billing/finalize-canceled` (매일 04:00 KST)가 `past_due_since + 3일 < now()` 감지 → `subscriptions.status='canceled'` + `organizations.plan='free'` + Toss 빌링키 파기(BR-39) → 이메일 안내. |
| 9 | `System` | `cron_runs` UPDATE (status='completed', result_summary={ processed, succeeded, failed, past_due_new }). |

### UC-30 — 플랜 업/다운그레이드

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/billing` → 플랜 비교 테이블의 상위/하위 플랜 [업그레이드] 또는 [다운그레이드] 클릭. |
| 2 | 시스템 | 다운그레이드면 멤버 수 검증: 대상 플랜 `max_members` < 현재 멤버 수면 차단 + 안내 "다운그레이드 전 멤버를 N명 이하로 줄여야 합니다." → 흐름 종료. |
| 3 | 시스템 | `<AlertDialog>` 확인. **업그레이드**: "지금 즉시 적용됩니다. 잔여 기간에 대한 차액 {amount}원이 결제됩니다." / **다운그레이드**: "현재 기간({current_period_end})까지 현재 플랜이 유지되고, 그 후 자동으로 변경됩니다." |
| 4 | `Admin` | [확인] 클릭. |
| 5 | 시스템 | `POST /api/billing/subscription/change { to_plan, mode }`. |
| 6 | 시스템 (업그레이드) | 서버: prorated 차액 계산 → 신규 `orders` INSERT (`kind='plan_change'`, `metadata={from_plan, to_plan, proration_amount}`) → 빌링키로 즉시 결제 → 성공 시 `subscriptions.plan=to_plan` + `organizations.plan=to_plan` + `usage_quotas` 갱신. |
| 7 | 시스템 (다운그레이드) | 서버: `subscriptions.pending_downgrade_to=to_plan` 메타만 기록 → `current_period_end` 도래 시 cron이 실제 변경 적용. UI에는 "다음 결제일에 {to_plan}으로 변경됩니다" 안내. |
| 8 | 시스템 | 성공 토스트 + `/billing` 갱신. |

### UC-31 — 구독 해지 예약 (v1.4 재작성, BR-38)

> 즉시 종료가 아닌 **'해지 예약'** 패턴. `current_period_end`까지 Pro 기능 사용 가능하며, 결제일 전이면 언제든 UC-38로 취소 가능.

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/billing` → 활성 구독 카드의 [구독 취소] 클릭. |
| 2 | 시스템 | `<AlertDialog>`: "정말 취소하시겠습니까? · {current_period_end}까지 Pro 기능을 계속 사용할 수 있습니다 · **결제 예정일 전이라면 언제든 해지 예약을 취소할 수 있습니다**." + [취소 안 함] [구독 취소]. |
| 3 | `Admin` | [구독 취소] 클릭. |
| 4 | 시스템 | `POST /api/billing/subscription/cancel`. 서버: `subscriptions.cancel_scheduled_at = now()` UPDATE + `next_billing_at = NULL` (정기결제 cron이 재청구 안 함) + `status='active'` 유지 (사용은 정상). 빌링키는 보관 유지. |
| 5 | 시스템 | "구독 해지가 예약되었습니다 · {date}까지 Pro 기능을 사용할 수 있습니다 · [해지 예약 취소]" 토스트 ([usecase-common §4-3](usecase-common.md#4-3-성공-피드백)). `/billing`이 해지 예약 amber 카드로 전환 — "{date}까지 Pro 기능을 사용할 수 있습니다 · 그 이후 무료 플랜으로 전환됩니다" + [해지 예약 취소] 버튼. |
| 6 | `System` (current_period_end 도래) | 매일 04:00 KST QStash Schedule `/api/cron/billing/finalize-canceled` 실행: ① `subscriptions.status='canceled'` + `canceled_at=now()` ② `organizations.plan='free'` 강등 + `usage_quotas` free 한도 적용 (BR-32) ③ **Toss `DELETE /v1/billing/authorizations/{billingKey}` 호출 → `billing_key_encrypted=NULL` (BR-39)** ④ `payment_logs`에 `BILLING_KEY_DELETE_REQ/RES` 기록 ⑤ 사용자에게 이메일 안내 "구독이 종료되었습니다 · 무료 플랜으로 전환되었습니다 · 재구독 시 신규 카드 등록이 필요합니다". |

### UC-38 — 구독 해지 예약 취소 (v1.4 신규, BR-38)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/billing` 해지 예약 amber 카드의 [해지 예약 취소] 클릭. |
| 2 | 시스템 | (모달 없이 즉시 처리 — [usecase-common §4-4](usecase-common.md#4-4-확인-다이얼로그-alertdialog) 다이얼로그 미사용 정책: 되돌리는 작업이므로 위험 없음) `DELETE /api/billing/subscription/cancel` 호출. |
| 3 | 시스템 | 서버: 조건 검증 — `status='active'` && `cancel_scheduled_at IS NOT NULL` && `current_period_end > now()`. 미충족 시 409 분기(5-12 참조). |
| 4 | 시스템 | 정상 (v1.4.1 트랜잭션 안전 처리): 단일 DB 트랜잭션 내 — ① `SELECT ... FOR UPDATE`로 `subscriptions` 행 락 (billing/tick·finalize-canceled cron과 직렬화) ② 락 획득 후 상태 재검증 (락 대기 중 cron이 finalize-canceled 처리했을 수 있음, 5-12 분기) ③ `next_billing_at`을 `MAX(current_period_end + 1일, now() + 1시간)`로 계산하여 **현재 시각 +1시간 미만이 절대 되지 않도록 보정** (즉시 cron 재실행 방지) ④ `subscriptions.cancel_scheduled_at = NULL` + `next_billing_at = 계산값` UPDATE → COMMIT. `status='active'` 유지. |
| 5 | 시스템 | "해지 예약이 취소되었습니다 · 구독이 정상 유지됩니다." 토스트. `/billing` 카드가 정상 활성 상태로 전환 (amber 카드 사라짐). |

**UC-38 DELETE 핸들러 의사코드 (v1.4.1 — 경합 방어 강화)**:
```typescript
await db.transaction(async (tx) => {
  // ① 행 락 — billing/tick·finalize-canceled cron이 SELECT FOR UPDATE SKIP LOCKED로 잡고 있다면 대기
  const sub = await tx.select().from(subscriptions)
    .where(eq(organization_id, orgId))
    .for('update');

  // ② 상태 재검증 (락 대기 중 cron이 처리했을 수 있음)
  if (sub.status !== 'active') {
    throw new ConflictError('SUBSCRIPTION_NOT_ACTIVE');  // 이미 canceled/past_due
  }
  if (sub.cancel_scheduled_at === null) {
    throw new BadRequestError('NO_CANCEL_SCHEDULED');    // UI에서는 도달 불가
  }
  if (sub.current_period_end <= now()) {
    throw new ConflictError('CANCEL_ALREADY_FINALIZED'); // cron이 처리 직전·중간
  }

  // ③ next_billing_at 보정 — MAX(current_period_end+1d, now()+1h)
  const safeMinFuture = addHours(now(), 1);
  const naturalNext = addDays(sub.current_period_end, 1);
  const newNextBilling = naturalNext > safeMinFuture ? naturalNext : safeMinFuture;

  // ④ 커밋
  await tx.update(subscriptions)
    .set({ cancel_scheduled_at: null, next_billing_at: newNextBilling })
    .where(eq(id, sub.id));
});
```

> billing/tick cron 측은 이미 `SELECT FOR UPDATE SKIP LOCKED`로 잡으므로 UC-38이 락을 잡고 있으면 SKIP → 다음 tick에서 재시도. 양방향 안전.

### UC-32 — 환불 요청·승인

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | `/billing/payments` → 환불 원하는 결제 행 [상세] 클릭 → `/billing/payments/[paymentKey]`. |
| 2 | 시스템 | 환불 요청 폼 표시: 사유 입력(필수) + 환불 예상액 실시간 표시 (`calculateRefundAmount`: `Math.floor(unitPrice × (qty - used - cancelled) × 0.9)` — 수수료 10%, 구독은 used=0). |
| 3 | `Admin` | 사유 입력 → [환불 요청] 클릭. |
| 4 | 시스템 | `<AlertDialog>`: "환불 요청을 제출하시겠습니까? · 관리자 승인 후 처리되며, 영업일 기준 3~5일 소요됩니다." + [취소] [요청 제출]. |
| 5 | `Admin` | [요청 제출]. |
| 6 | 시스템 | `POST /api/billing/payments/:paymentKey/cancel-request { reason }`. 서버: `payment_cancel_requests` INSERT (`status='PENDING'`, `refund_amount` 자동 계산). |
| 7 | 시스템 | "환불 요청이 접수되었습니다 · 관리자 승인 후 처리됩니다." 토스트. 결제 단건에 "환불 요청 대기 중" 뱃지 노출. |
| 8 | `SystemAdmin` | (별도 운영 콘솔에서) `PATCH /api/billing/cancel-requests/:id { status:'APPROVED' }` 호출. |
| 9 | `System` | 단일 트랜잭션: ① `tossRequest('POST', '/payments/{paymentKey}/cancel', { cancelReason: request.reason, cancelAmount: request.refund_amount })` → `payment_logs`에 `CANCEL_REQ/RES/ERR` 자동 기록 ② `payment_cancels` INSERT ③ `payments.status·balance_amount` UPDATE (전액=CANCELED, 부분=PARTIAL_CANCELED) ④ `orders.status` = PAY_CANCELED 또는 PAY_CANCELED_PARTIAL ⑤ `order_status_history` INSERT ⑥ 전액 취소면 `subscriptions.status='canceled'` 트리거(선택). |
| 10 | `System` | `Admin`에게 환불 완료 이메일. 다음 `/billing/payments/[paymentKey]` 진입 시 취소 이력 표에 새 행 노출. |

### UC-33 — 가상계좌 입금 대기·확인

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | UC-28 단계 7에서 결제수단으로 가상계좌 선택. |
| 2 | 시스템 (단계 10 분기) | Toss 응답이 `WAITING_FOR_DEPOSIT` → `orders.status='PAY_WAITING'` + `payments` UPSERT (가상계좌 정보 포함). 빌링키는 발급 안 함 (DONE 상태에서만). |
| 3 | 시스템 | result 페이지에 가상계좌 카드 표시: 은행명·계좌번호·입금자명·입금 마감일 + "가상계좌가 발급되었습니다 · 입금이 확인되면 자동으로 활성화됩니다." info 토스트. [복사하기] 버튼. |
| 4 | `Admin` | (외부) 은행 앱·창구에서 입금. |
| 5 | `System` | Toss가 `/api/webhooks/toss`에 `VIRTUAL_ACCOUNT_DEPOSIT_CALLBACK` 이벤트 발송. 서버: `webhook_events.event_id` UNIQUE 충돌 시 즉시 200 (BR-37). 신규면 `syncTossPaymentStatus(orderId)` 호출 → `orders.status='PAY_SUCCESS'` 전환 + 빌링키 발급 + 구독 활성화. |
| 6 | `System` | `Admin`에게 이메일 "결제가 확인되어 Pro 플랜이 활성화되었습니다". 다음 `/billing` 진입 시 활성 상태 확인 가능. |

---

## 4. 대안 흐름

### 4-1. 결제창에서 사용자 취소 (UC-28 단계 7)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | Toss 결제창 [×] 클릭으로 닫음. |
| 2 | 시스템 | SDK가 throw → catch(error.code==='USER_CANCEL') → `PATCH .../status { status:'AUTH_CANCEL', reason:'user_cancel' }`. |
| 3 | 시스템 | "결제가 취소되었습니다" 토스트 + [다시 시도] 버튼 + 주문 요약 카드 유지. 다시 클릭하면 새 orderId로 UC-28 처음부터. |

### 4-2. 인증 실패·SDK 예외 (UC-28 단계 7)

| 조건 | 처리 |
|------|------|
| 카드사 거절·기타 SDK throw | `PATCH .../status { status:'AUTH_FAIL', reason: error.message }`. 에러 메시지 표시 + [다시 시도] |

### 4-3. confirm 누락 폴백 (UC-28 단계 9 실패 — 사용자 새로고침·이탈)

> toss-quickstart §상태 동기화 구현 패턴

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | 시스템 | 사용자가 `/billing` 또는 `/billing/checkout/result` 재진입 시 `orders.status='AUTH_SUCCESS'` (confirm 누락분) 자동 감지. |
| 2 | 시스템 (백그라운드) | `POST /api/billing/orders/:orderId/sync` 자동 호출. 서버: `tossRequest('GET', '/payments/orders/:orderId')` → 응답 분기: ① DONE → PAY_SUCCESS 전환 + confirm 후처리 ② 404 + `expires_at` 초과 → PAY_EXPIRED. |
| 3 | 시스템 | 사용자에게는 결과만 노출 (성공 시 confetti + 영수증 / 만료 시 "결제가 만료되었습니다 · 다시 시도해주세요"). |

### 4-4. 주문 만료 (UC-28 단계 4 이후 30분 경과)

| 조건 | 처리 |
|------|------|
| `/api/cron/billing/expire-orders` 5분 간격 cron이 `AUTH_READY`·`AUTH_SUCCESS` 상태이면서 `expires_at < now()` 주문 발견 | `orders.status='PAY_EXPIRED'` + `order_status_history` 기록. 사용자가 다시 진입 시 "결제가 만료되었습니다 · 다시 시도해주세요" 안내 + 신규 orderId로 재진행 |

### 4-5. ORDER 상태 주문 사용자 취소 (UC-28 단계 2~3 사이 이탈)

| 단계 | 행동 주체 | 내용 |
|------|---------|------|
| 1 | `Admin` | 주문 생성 직후 [취소] 버튼 클릭 또는 페이지 이탈. |
| 2 | 시스템 (취소 버튼) | `DELETE /api/billing/orders/:orderId`. `status='ORDER'`인 주문만 삭제 가능 (다른 상태는 400) → 고아 주문 누적 방지. |

---

## 5. 예외 흐름

- **공통 예외** (네트워크·세션 만료·403·404·500): [usecase-common.md §3](usecase-common.md#3-공통-예외-처리-common-exception-handling) 참조

### 5-1. 클라이언트 amount 변조 시도 (UC-28 단계 9)

| 조건 | 처리 |
|------|------|
| 사용자가 successUrl 쿼리의 amount를 임의로 변경 후 confirm 요청 | 서버는 **DB `total_amount` 사용** (BR-35-b). 클라이언트 amount는 무시되므로 영향 없음. Toss는 confirm 요청의 amount와 자기네 DB amount를 한 번 더 검증하므로 변조 시 `FORBIDDEN_REQUEST` 반환 |

### 5-2. confirm 상태 가드 위반 (UC-28 단계 9)

| 조건 | 처리 |
|------|------|
| `orders.status`가 AUTH_SUCCESS가 아닌 상태에서 confirm 요청 (중복 호출 등) | 400 + `error_code='INVALID_ORDER_STATUS'` (BR-35-c, CONFIRMABLE_STATUSES 가드). 사용자에게 "이미 처리된 결제입니다" 안내 |

### 5-3. confirm 정확히 1회 보장 실패 (UC-28 단계 9)

| 조건 | 처리 |
|------|------|
| React StrictMode 또는 사용자 새로고침으로 confirm 2회 호출 | useRef 가드로 클라이언트 1회 제한 + 서버 상태 가드(5-2)로 2중 방어. 두 번째 호출은 400 + INVALID_ORDER_STATUS — 사용자에게는 첫 번째 결과만 표시 |

### 5-4. 카드 거절 (UC-28 단계 10)

| 조건 | 처리 |
|------|------|
| Toss 응답이 `ABORTED` 또는 카드사 거절 에러 (`REJECT_CARD_COMPANY` 등) | `orders.status='PAY_FAIL'` + `payment_error_codes` 매핑으로 한글 표시. result 페이지에 "결제 실패: {한글 메시지}" + [다시 시도] [다른 결제수단] |

### 5-5. Webhook 중복 수신 (UC-33 단계 5)

| 조건 | 처리 |
|------|------|
| Toss가 동일 `eventId`로 가상계좌 입금 이벤트 재전송 | `webhook_events.event_id` UNIQUE 충돌 → 즉시 200 OK + 처리 스킵 (BR-37). 항상 200 응답 (5xx 시 Toss 지수 백오프 재시도로 중복 처리 위험) |

### 5-6. Webhook 5xx 응답 금지

| 조건 | 처리 |
|------|------|
| 처리 중 내부 오류 발생 | 그래도 200 응답 + 내부 큐에 재처리 등록 (toss-quickstart §Webhook). 5xx 절대 반환 금지 |

### 5-7. 정기결제 빌링키 만료·카드 정지 (UC-29 단계 5)

| 조건 | 처리 |
|------|------|
| Toss 빌링키 결제 API가 `INVALID_CARD`·`EXPIRED_CARD` 등 반환 | `past_due` 진입 (BR-36) → 3일 grace → 자동 free 강등. 사용자가 grace 내에 `/billing`에서 [카드 변경 → 새 결제]로 새 빌링키 발급 가능 (UC-28 흐름 재진입) |

### 5-8. 환불 요청 거절 (UC-32 단계 8)

| 조건 | 처리 |
|------|------|
| `SystemAdmin`이 거절 (예: 약관 위반·이미 사용된 기간) | `PATCH /api/billing/cancel-requests/:id { status:'REJECTED', decided_reason }`. `payment_cancel_requests.status='REJECTED'` UPDATE → `Admin`에게 이메일 안내 |

### 5-9. 부분 취소 후 잔액 추가 취소 (UC-32, 권장 정책)

| 조건 | 처리 |
|------|------|
| 이미 PAY_CANCELED_PARTIAL 상태의 결제에 추가 환불 요청 | `CANCELED_STATUSES`(PAY_SUCCESS·PAY_CANCELED_PARTIAL) 가드 통과 — 잔액 한도 내 추가 환불 가능. `balance_amount`보다 큰 환불 요청은 400 |

### 5-10. 가상계좌 입금 마감일 초과 (UC-33)

| 조건 | 처리 |
|------|------|
| 사용자가 입금 마감일까지 입금하지 않음 | Toss가 자동으로 EXPIRED 처리 → Webhook 수신 시 `orders.status='PAY_EXPIRED'`. `Admin`에게 이메일 "입금 기한이 초과되어 결제가 만료되었습니다 · 다시 시도해주세요" |

### 5-11. 플랜 한도 초과로 구독 중 사용 차단 (BR-32)

| 조건 | 처리 |
|------|------|
| 활성 구독이지만 월간 quota 한도 도달 | 402 Payment Required + `error_code='QUOTA_EXCEEDED'` + 모달 (사용량 차트 + "다음 결제 주기까지 N일") — 이 시점 업그레이드는 UC-30으로 |

### 5-12. 해지 예약 취소 조건 미충족 (UC-38, v1.4)

| 조건 | 처리 |
|------|------|
| `current_period_end <= now()` (이미 cron이 finalize 처리함) | 409 + `error_code='CANCEL_ALREADY_FINALIZED'` + 토스트 "이미 처리되어 취소할 수 없습니다 · 다시 구독해주세요" + [Pro 구독 →] CTA → UC-28 |
| `cancel_scheduled_at IS NULL` (예약 안 되어 있음) | 400 + `error_code='NO_CANCEL_SCHEDULED'` (UI에서는 [해지 예약 취소] 버튼 자체가 안 보이므로 정상 도달 불가, URL 직접 호출 등) |
| `status != 'active'` (이미 canceled 또는 past_due) | 400 + `error_code='SUBSCRIPTION_NOT_ACTIVE'` |

### 5-13. QStash 무료 한도 초과 (운영 단계, v1.4)

| 조건 | 처리 |
|------|------|
| QStash 일 500 메시지 한도 초과로 cron 호출 실패 | 사용자 영향 없음. SystemAdmin이 `/system/crons`에서 cron_runs 누락 감지 → QStash 유료 전환 결정. 정기결제 호출 자체가 실패하면 결제 누락 위험 → 운영자 알림 필요 (Phase 4) |

---

## 6. 사후 조건

| UC | DB 변경 |
|----|---------|
| UC-28 (성공) | `users.payment_customer_key` 최초 발급 INSERT + `orders` INSERT(`status='PAY_SUCCESS'`) + `order_items`·`order_status_history` INSERT + `payments` UPSERT + `subscriptions` UPSERT(`status='active'`, `billing_key_encrypted` 채워짐) + `organizations.plan` UPDATE + `usage_quotas` 행 갱신 + `payment_logs` 6+행 (BILLING_KEY_ISSUE_*·CONFIRM_*) |
| UC-29 (정기 성공) | 신규 `orders` INSERT(`kind='recurring'`, `status='PAY_SUCCESS'`) + `payments` UPSERT + `subscriptions.next_billing_at·current_period_end` += 1개월 + `payment_logs` RECURRING_CHARGE_* 기록 |
| UC-29 (정기 실패) | `orders` INSERT(`status='PAY_FAIL'`) + `subscriptions.status='past_due'`·`past_due_since=now()` + `payment_logs` ERR 기록 |
| UC-29 (3일 grace 경과) | `subscriptions.status='canceled'` + `organizations.plan='free'` + `usage_quotas` free 한도 적용 |
| UC-30 (업그레이드 즉시) | `orders` INSERT(`kind='plan_change'`) + 빌링키 결제 → `payments` UPSERT + `subscriptions.plan` UPDATE + `organizations.plan` UPDATE |
| UC-30 (다운그레이드 예약) | `subscriptions.pending_downgrade_to=to_plan` 메타만 — 실 변경은 cron이 current_period_end에 처리 |
| UC-31 (v1.4 재작성) | `subscriptions.cancel_scheduled_at=now()` + `next_billing_at=NULL`. `status='active'` 유지. current_period_end 도래 시 finalize-canceled cron이 `status='canceled'` 전환 + 빌링키 파기(BR-39) |
| UC-38 (v1.4 신규) | `subscriptions.cancel_scheduled_at=NULL` + `next_billing_at = current_period_end + 1일` 재설정. `status='active'` 유지 |
| UC-32 (요청) | `payment_cancel_requests` INSERT(`status='PENDING'`) |
| UC-32 (승인) | `payment_cancels` INSERT + `payments.status·balance_amount` UPDATE + `orders.status` UPDATE + `order_status_history` INSERT + `payment_cancel_requests.status='APPROVED'` + 전액이면 구독 종료 |
| UC-33 (입금 완료) | UC-28 단계 10과 동일 변경 (Webhook 트리거) |

---

## 7. UI/UX 고려사항

- **페이지 영역**: [IA.md §6](../IA.md) `/billing/**` 섹션
- **모달 패턴**: [usecase-common.md §4-4](usecase-common.md#4-4-확인-다이얼로그-alertdialog)

**11상태 뱃지 색상 매핑 (`/billing/payments` 표)**

| 상태 | 색상 | 표시명 |
|------|------|--------|
| PAY_SUCCESS | Sage Green | "결제 완료" |
| PAY_WAITING | amber | "입금 대기" |
| PAY_FAIL, PAY_EXPIRED | red | "결제 실패" / "만료" |
| PAY_CANCELED | warm-gray | "전액 취소" |
| PAY_CANCELED_PARTIAL | warm-gray | "부분 취소 (잔액 N원)" |
| AUTH_READY, AUTH_SUCCESS | light gray | "결제 진행 중" (미완료) |
| AUTH_CANCEL, AUTH_FAIL | light gray | "취소됨" / "실패" |

**구독 해지 예약 AlertDialog (UC-31, v1.4 재작성, BR-38)**

```
[제목] 구독을 취소하시겠습니까?
[본문] {current_period_end}까지 Pro 기능을 계속 사용할 수 있습니다.
       그 후 자동으로 무료 플랜으로 전환되며, 등록된 카드는 삭제됩니다.
       결제 예정일 전이라면 언제든 해지 예약을 취소할 수 있습니다.
       지금 취소해도 환불은 진행되지 않습니다.
[버튼] [취소 안 함]  [구독 취소]
```

**해지 예약 카드 (UC-31 사후, /billing 페이지)**

```
[amber 배경 카드]
"구독 해지가 예약되었습니다"
"{current_period_end}까지 Pro 기능을 사용할 수 있습니다 ·
 그 이후 무료 플랜으로 전환됩니다"
[해지 예약 취소] ← UC-38 진입
```

**해지 예약 취소 (UC-38, 다이얼로그 없음)**

> 되돌리는 작업이므로 위험 없음 — AlertDialog 미사용, 즉시 토스트로 처리.
> 토스트: "해지 예약이 취소되었습니다 · 구독이 정상 유지됩니다."

**환불 요청 AlertDialog (UC-32)**

```
[제목] 환불 요청을 제출하시겠습니까?
[본문] 환불 예상액: {refund_amount}원 (수수료 10% 차감)
       관리자 승인 후 처리되며, 영업일 기준 3~5일 소요됩니다.
[버튼] [취소]  [요청 제출]
```

**가상계좌 입금 안내 (UC-33)**

```
[제목 영역] 가상계좌가 발급되었습니다
[정보] 은행: {bank}
       계좌번호: {account} [복사]
       입금자명: {name}
       입금 금액: {amount}원
       마감일: {due}
[안내] 입금이 확인되면 자동으로 활성화됩니다.
       이메일로도 안내드립니다.
[액션] [홈으로]
```

**대시보드 결제 알림 배너 (BR-36)**

| 조건 | 표시 |
|------|------|
| `subscriptions.status='past_due'` | 빨강 영구 배너 (admin만 노출) — "정기결제 실패 · 3일 내 카드 갱신 필요 · [지금 결제 →]" |
| `subscriptions.status='canceled'` | amber 배너 — "{current_period_end}까지 사용 가능 · [다시 구독 →]" |

---

## 8. 데이터 요구사항

### API 엔드포인트 ([TRD §3-4](../TRD.md#3-4-api-설계) 단일 정의 참조)

| 메서드 | 엔드포인트 | UC |
|--------|-----------|-----|
| `GET` | `/api/billing/plans` | 플랜 카탈로그 |
| `GET` | `/api/billing/subscription` | 현재 구독 상태 |
| `GET` | `/api/billing/usage` | 이번 달 사용량 |
| `POST` | `/api/billing/orders` | UC-28 주문 생성 |
| `DELETE` | `/api/billing/orders/:orderId` | 4-5 ORDER 상태 정리 |
| `PATCH` | `/api/billing/orders/:orderId/status` | UC-28 AUTH_* 전환 |
| `POST` | `/api/billing/orders/:orderId/confirm` | UC-28 confirm |
| `POST` | `/api/billing/orders/:orderId/sync` | 4-3 폴백 동기화 |
| `POST` | `/api/billing/subscription/cancel` | UC-31 (v1.4 재작성 — 해지 예약 설정) |
| `DELETE` | `/api/billing/subscription/cancel` | UC-38 (v1.4 신규 — 해지 예약 취소) |
| `POST` | `/api/billing/subscription/change` | UC-30 (v1.4: Phase 4까지 사용 사례 없음) |
| `GET` | `/api/billing/payments` | 결제 이력 |
| `GET` | `/api/billing/payments/:paymentKey` | 결제 단건 |
| `POST` | `/api/billing/payments/:paymentKey/cancel-request` | UC-32 요청 |
| `PATCH` | `/api/billing/cancel-requests/:id` | UC-32 승인 (SystemAdmin) |
| `POST` | `/api/webhooks/toss` | UC-33 Webhook |
| `POST` | `/api/cron/billing/tick` | UC-29 정기결제 cron (v1.4: 매일 02:00 KST) |
| `POST` | `/api/cron/billing/finalize-canceled` | v1.4 신규: 해지 예약 만료 + past_due 3일 grace 종료 처리 (매일 04:00 KST) |
| `POST` | `/api/cron/billing/expire-orders` | 4-4 만료 cron |

### 입력·출력 스키마

- 모든 요청·응답 스키마는 **[TRD §3-4](../TRD.md#3-4-api-설계) "Phase 3 — 구독 결제 스키마"** 단일 정의를 따른다.
- 11상태 정의·상태 가드 화이트리스트·`tossRequest()` 래퍼·환불 계산 로직은 **[`docs/quickstart/toss-quickstart.md`](../quickstart/toss-quickstart.md)** SSOT.

---

## 9. 보안 및 권한

| 항목 | 내용 |
|------|------|
| 핵심 보안 원칙 5가지 | BR-35 — toss-quickstart §핵심 보안 원칙 100% 준수 |
| 인증 | 전 엔드포인트 Clerk JWT 검증 + Webhook은 HMAC-SHA256 서명 검증 |
| 역할 검증 | `/api/billing/**` 모두 `withAdminRole` 통과 필수 (UC-32 승인 PATCH는 SystemAdmin 별도 가드) |
| 카드 정보 | 직접 저장 절대 금지 — Toss 결제창이 토큰화. 우리 DB는 `billing_key_encrypted`만 (AES-256-GCM) |
| 감사 로그 | 모든 Toss API 호출이 `tossRequest()` 래퍼로 `payment_logs` 자동 기록 (REQ/RES/ERR 3종) — `fetch` 직접 사용 금지 |
| 멱등성 | `webhook_events.event_id` UNIQUE (BR-37) + `payments.payment_key` UNIQUE + `payment_cancel_requests` 동일 order에 PENDING 1건 제한 |
| 만료 정책 | `orders.expires_at = +30분`(toss 권장 10분보다 보수적) + 5분 cron으로 자동 PAY_EXPIRED |
| customerKey | 사용자별 영구 UUID v4 (BR-35-e) — `users.payment_customer_key` UNIQUE NOT NULL (가입 시 발급) |
| Personal Org 결제 | Personal Org도 Pro 업그레이드 가능 — 단 멤버 한도 1명 유지(BR-31). Pro의 multi-member 가치는 일반 조직 한정 |
| **cron 인증 (v1.4)** | 모든 `/api/cron/billing/**`는 QStash JWT 서명 검증(`@upstash/qstash` Receiver, `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`). 검증 실패 401 + 로그 최소화 |
| **cron 멱등성 (v1.4, BR-37)** | 모든 cron 핸들러 첫 단계에서 `webhook_events.event_id = Upstash-Message-Id` UPSERT. 중복 시 즉시 200 OK + 처리 스킵 |
| **자동 재시도 정책 (v1.4, BR-36)** | QStash가 5xx 응답을 받으면 기본 3회 지수 백오프 재시도. **카드 거절·잔액 부족 같은 영구 실패는 4xx로 응답해야 재시도 회피** + past_due 진입 |
| **빌링키 파기 (v1.4, BR-39)** | `finalize-canceled` cron이 Toss `DELETE /v1/billing/authorizations/{billingKey}` 호출. 실패 시 `payment_logs.BILLING_KEY_DELETE_ERR` 기록 + 다음 cron 재시도. DB의 `billing_key_encrypted=NULL`은 Toss 응답 200 확정 후에만 설정 |
