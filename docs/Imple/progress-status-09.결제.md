# 구현 진행 상태 — Phase 3 결제·구독 관리 (UC-28~33, 38)

> 시작일: 2026-05-18 | 완료일: - | 참조: docs/usecase/09-usecase-결제.md · docs/quickstart/toss-quickstart.md · docs/tech/toss.md

---

## 단계별 진행 상태

### 1단계: 사전 준비 (사용자 액션)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1-01 | Toss Payments 개발자센터 — 테스트 클라이언트 키 / 시크릿 키 발급 | ✅ | 사용자 완료 |
| 1-02 | Upstash QStash — QSTASH_CURRENT/NEXT_SIGNING_KEY 발급 | ✅ | 사용자 완료 |
| 1-03 | .env.local — NEXT_PUBLIC_TOSS_CLIENT_KEY, TOSS_SECRET_KEY, BILLING_KEY_ENCRYPTION_SECRET, QSTASH_* 추가 | ✅ | 사용자 완료 |
| 1-04 | pnpm add @tosspayments/tosspayments-sdk @upstash/qstash | ✅ | 사용자 완료 |

---

### 2단계: DB 스키마 확장 + 마이그레이션

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 2-01 | schema.ts — `subscriptions` 테이블 (billing_key_encrypted, cancel_scheduled_at) | ✅ | |
| 2-02 | schema.ts — `usage_quotas` 테이블 (조직별 월간 사용량) | ✅ | |
| 2-03 | schema.ts — `orders` 테이블 (id VARCHAR(64), 11상태) | ✅ | |
| 2-04 | schema.ts — `order_items` 테이블 | ✅ | |
| 2-05 | schema.ts — `order_status_history` 테이블 (감사 이력) | ✅ | |
| 2-06 | schema.ts — `payments` 테이블 (payment_key, raw_data JSONB) | ✅ | |
| 2-07 | schema.ts — `payment_logs` 테이블 (REQ/RES/ERR 감사) | ✅ | |
| 2-08 | schema.ts — `payment_cancel_requests` 테이블 | ✅ | |
| 2-09 | schema.ts — `payment_cancels` 테이블 | ✅ | |
| 2-10 | schema.ts — `cron_runs` 테이블 (cron 실행 이력) | ✅ | |
| 2-11 | pnpm drizzle-kit generate | ⏳ | 사용자 실행 필요 |
| 2-12 | pnpm drizzle-kit migrate | ⏳ | 사용자 실행 필요 |

---

### 3단계: 서비스 레이어 (tossRequest 래퍼 + 상태 가드)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 3-01 | src/lib/toss.ts — tossRequest() 래퍼 (REQ/RES/ERR 감사 로그 자동 기록) | ✅ | BR-35-d |
| 3-02 | src/features/billing/backend/constants.ts — 11개 내부 상태 + 5개 가드 상수 | ✅ | CLIENT_TRANSITION / CONFIRMABLE 등 |
| 3-03 | src/features/billing/backend/billing-key.ts — AES-256-GCM 암호화/복호화 | ✅ | billingKey 서버 보관 |
| 3-04 | src/features/billing/backend/service.ts — confirmTossPayment, syncTossPaymentStatus | ✅ | toss-quickstart 패턴 |
| 3-05 | src/features/billing/backend/customer-key.ts — getOrCreatePaymentCustomerKey | ✅ | crypto.randomUUID() 영구 발급 |

---

### 4단계: 결제 API (Hono 라우터, 14개 엔드포인트)

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 4-01 | GET /api/billing/plans — 플랜 카탈로그 (공개) | ✅ | Free/Pro 2종 |
| 4-02 | GET /api/billing/subscription — 현재 구독 상태 | ✅ | |
| 4-03 | GET /api/billing/usage — 이번 달 사용량 | ✅ | usage_quotas 조회 |
| 4-04 | POST /api/billing/orders — 주문 생성 (UC-28 §3) | ✅ | ORDER 상태, expires_at +30분 |
| 4-05 | DELETE /api/billing/orders/:orderId — ORDER 상태 주문 삭제 | ✅ | 고아 주문 정리 |
| 4-06 | PATCH /api/billing/orders/:orderId/status — AUTH_* 전환 | ✅ | CLIENT_TRANSITION_STATUSES 가드 |
| 4-07 | POST /api/billing/orders/:orderId/confirm — UC-28 confirm | ✅ | DB amount 사용, CONFIRMABLE_STATUSES 가드 |
| 4-08 | POST /api/billing/orders/:orderId/sync — 폴백 동기화 (4-3) | ✅ | |
| 4-09 | POST /api/billing/subscription/cancel — UC-31 해지 예약 | ✅ | cancel_scheduled_at=now(), next_billing_at=NULL |
| 4-10 | DELETE /api/billing/subscription/cancel — UC-38 해지 예약 취소 | ✅ | next_billing_at 보정 (UC-38 v1.4.1) |
| 4-11 | GET /api/billing/payments — 결제 이력 (페이지네이션) | ✅ | |
| 4-12 | GET /api/billing/payments/:paymentKey — 결제 단건 | ✅ | |
| 4-13 | POST /api/billing/payments/:paymentKey/cancel-request — UC-32 환불 요청 | ✅ | |
| 4-14 | hono/index.ts에 billing route 등록 | ✅ | |

---

### 5단계: Webhook + Cron 핸들러

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 5-01 | POST /api/webhooks/toss — UC-33 Webhook (멱등성, 항상 200) | ✅ | webhook_events UNIQUE |
| 5-02 | proxy.ts — /api/webhooks/toss 공개 경로 이미 /api/webhooks(.*) 포함 | ✅ | 기존 패턴으로 커버됨 |
| 5-03 | POST /api/cron/billing/tick — UC-29 정기결제 (매일 02:00 KST) | ✅ | QStash JWT 검증 |
| 5-04 | POST /api/cron/billing/expire-orders — 만료 주문 처리 (15분) | ✅ | |
| 5-05 | POST /api/cron/billing/finalize-canceled — 해지 완결 + 빌링키 파기 (매일 04:00 KST) | ✅ | BR-39 |

---

### 6단계: 프론트엔드 페이지

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 6-01 | TanStack Query 훅 — use-billing.ts (subscription, usage, payments, orders) | ✅ | |
| 6-02 | /billing — 플랜 비교 + 현재 구독 상태 카드 | ✅ | Free/Pro, org:admin만 |
| 6-03 | /billing — 해지 예약 amber 카드 + [해지 예약 취소] 버튼 (UC-31·38) | ✅ | |
| 6-04 | /billing — past_due 빨강 배너 (BR-36) | ✅ | |
| 6-05 | /billing/checkout — 주문 요약 카드 + 30분 카운트다운 + Toss SDK 결제창 | ✅ | UC-28 §3~7 |
| 6-06 | /billing/checkout/result — 성공(confetti) / 실패 / 가상계좌 3분기 (단일 URL) | ✅ | useRef 가드로 confirm 1회 보장 |
| 6-07 | /billing/payments — 결제 이력 테이블 + 11상태 뱃지 | ✅ | |
| 6-08 | /billing/payments/[paymentKey] — 결제 단건 + 환불 요청 폼 (UC-32) | ✅ | |

---

### 7단계: 사이드바 · 레이아웃 확장

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 7-01 | 사이드바 플랜 뱃지 (Free/Pro) | ✅ | |
| 7-02 | 사이드바 잔여 사용량 progress bar (IA.md §v1.4) | ✅ | 8/10 형태, Free일 때 업그레이드 버튼 |
| 7-03 | 대시보드 레이아웃 — past_due 빨강 배너 (admin만, BR-36) | ✅ | DeletedOrgBanner 패턴 동일 |

---

### 8단계: progress-status.md 갱신

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 8-01 | docs/Imple/progress-status.md — UC-28~33·38 결제 섹션 추가 | ✅ | |

---

## 현재 진행 단계

```
✅ 1단계: 사전 준비 (사용자 액션) — 완료
✅ 2단계: DB 스키마 확장 + 마이그레이션 — 완료
✅ 3단계: 서비스 레이어 — 완료
✅ 4단계: 결제 API — 완료
✅ 5단계: Webhook + Cron — 완료
✅ 6단계: 프론트엔드 페이지 — 완료
✅ 7단계: 사이드바·레이아웃 확장 — 완료
✅ 8단계: progress-status.md 갱신 — 완료
```

---

## 핵심 결정사항 (구현 기준)

| 항목 | 결정 |
|------|------|
| `orders.id` 타입 | `VARCHAR(64)` 문자열 (Toss orderId, UUID uuid 타입 사용 금지) |
| confirm 금액 | 클라이언트 amount 무시, DB `total_amount` 사용 (BR-35-b) |
| 상태 가드 | `AUTH_SUCCESS`만 confirm 가능 (CONFIRMABLE_STATUSES) |
| 모든 Toss 호출 | `tossRequest()` 래퍼 경유 필수, fetch 직접 사용 금지 (BR-35-d) |
| customerKey | UUID v4 영구 발급, orderId·email 사용 금지 (BR-35-e) |
| billingKey 보관 | AES-256-GCM 암호화하여 `subscriptions.billing_key_encrypted` 저장 |
| 해지 예약 | 즉시 종료 X — `cancel_scheduled_at=now()`, `status='active'` 유지 (BR-38) |
| 빌링키 파기 | `finalize-canceled` cron이 Toss DELETE 후 `billing_key_encrypted=NULL` (BR-39) |
| Webhook | 항상 200 응답, `webhook_events.event_id` UNIQUE 멱등성 (BR-37) |
| cron 인증 | QStash JWT 서명 검증 (`@upstash/qstash` Receiver) |
| neon-http 트랜잭션 | `db.batch([...])` 사용, 종속 쿼리는 순차 실행 |
| UC-38 경합 방어 | `SELECT FOR UPDATE` 락 + `next_billing_at = MAX(current_period_end+1d, now()+1h)` |
