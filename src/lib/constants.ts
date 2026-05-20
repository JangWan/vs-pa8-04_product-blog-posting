/**
 * DB 컬럼 enum성 값 중앙 관리 파일
 * Java enum 패턴 — 리터럴 문자열 대신 반드시 이 상수를 사용할 것
 */

// ── 구독 상태 ────────────────────────────────────────────────────────────────
// subscriptions.status
export const SUBSCRIPTION_STATUS = {
  ACTIVE:           "active",           // 정상 구독 (billing_key 있음)
  SUSPENDED:        "suspended",        // billing_key 없음 — 결제 수단 재등록 필요
  PAST_DUE:         "past_due",         // 정기결제 실패 (3일 grace 중, billing_key 있음)
  CANCEL_SCHEDULED: "cancel_scheduled", // 해지 예약됨 (현재 기간 만료 후 canceled)
  CANCELED:         "canceled",         // 취소 완료 (이력 보존용)
} as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

// ── 플랜 코드 ─────────────────────────────────────────────────────────────────
// subscriptions.plan / organizations.plan / users.plan
export const PLAN_CODE = {
  FREE: "free",
  PRO:  "pro",
  MAX:  "max",
} as const;

export type PlanCode = (typeof PLAN_CODE)[keyof typeof PLAN_CODE];

// ── 주문 상태 (11종) ──────────────────────────────────────────────────────────
// orders.status — toss-quickstart §내부 주문 상태 설계
export const ORDER_STATUS = {
  ORDER:               "ORDER",
  AUTH_READY:          "AUTH_READY",
  AUTH_SUCCESS:        "AUTH_SUCCESS",
  AUTH_CANCEL:         "AUTH_CANCEL",
  AUTH_FAIL:           "AUTH_FAIL",
  PAY_SUCCESS:         "PAY_SUCCESS",
  PAY_FAIL:            "PAY_FAIL",
  PAY_WAITING:         "PAY_WAITING",
  PAY_EXPIRED:         "PAY_EXPIRED",
  PAY_CANCELED:        "PAY_CANCELED",
  PAY_CANCELED_PARTIAL:"PAY_CANCELED_PARTIAL",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

// 상태 가드 화이트리스트 (BR-35-c) — 클라이언트 직접 전환 허용 4종
export const CLIENT_TRANSITION_STATUSES: OrderStatus[] = [
  ORDER_STATUS.AUTH_READY,
  ORDER_STATUS.AUTH_SUCCESS,
  ORDER_STATUS.AUTH_CANCEL,
  ORDER_STATUS.AUTH_FAIL,
];

// activate API 진입 가드 (빌링키 발급+즉시결제)
export const ACTIVATABLE_STATUSES: OrderStatus[] = [
  ORDER_STATUS.ORDER,
  ORDER_STATUS.AUTH_READY,
];

// 취소 API 진입 가드 (부분 취소 후 추가 취소 포함)
export const CANCELED_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PAY_SUCCESS,
  ORDER_STATUS.PAY_CANCELED_PARTIAL,
];

// 페이지 진입 시 Toss 자동 동기화 대상
export const AUTO_SYNC_STATUSES: OrderStatus[] = [ORDER_STATUS.AUTH_SUCCESS];

// 콘텐츠 접근 허용 상태
export const PAID_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PAY_SUCCESS,
  ORDER_STATUS.PAY_CANCELED_PARTIAL,
];

// Toss 공식 상태 → 내부 상태 매핑
export const TOSS_STATUS_MAP: Record<string, OrderStatus> = {
  DONE:                ORDER_STATUS.PAY_SUCCESS,
  CANCELED:            ORDER_STATUS.PAY_CANCELED,
  PARTIAL_CANCELED:    ORDER_STATUS.PAY_CANCELED_PARTIAL,
  ABORTED:             ORDER_STATUS.PAY_FAIL,
  EXPIRED:             ORDER_STATUS.PAY_EXPIRED,
  WAITING_FOR_DEPOSIT: ORDER_STATUS.PAY_WAITING,
  IN_PROGRESS:         ORDER_STATUS.AUTH_SUCCESS,
  READY:               ORDER_STATUS.AUTH_READY,
};

// ── 주문 종류 ─────────────────────────────────────────────────────────────────
// orders.kind
export const ORDER_KIND = {
  NEW_SUBSCRIPTION:      "new_subscription",
  RECURRING:             "recurring",
  PLAN_CHANGE:           "plan_change",
  PAYMENT_METHOD_UPDATE: "payment_method_update",
  PLAN_UPGRADE:          "plan_upgrade",
} as const;

export type OrderKind = (typeof ORDER_KIND)[keyof typeof ORDER_KIND];

// ── 조직 멤버 역할 ─────────────────────────────────────────────────────────────
// organization_members.role
export const ORG_ROLE = {
  ADMIN:  "org:admin",
  MEMBER: "org:member",
} as const;

export type OrgRole = (typeof ORG_ROLE)[keyof typeof ORG_ROLE];

// ── 환불 요청 상태 ─────────────────────────────────────────────────────────────
// payment_cancel_requests.status
export const CANCEL_REQUEST_STATUS = {
  PENDING:  "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type CancelRequestStatus = (typeof CANCEL_REQUEST_STATUS)[keyof typeof CANCEL_REQUEST_STATUS];

// ── cron 실행 상태 ────────────────────────────────────────────────────────────
// cron_runs.status
export const CRON_STATUS = {
  RUNNING:   "running",
  COMPLETED: "completed",
  FAILED:    "failed",
} as const;

export type CronStatus = (typeof CRON_STATUS)[keyof typeof CRON_STATUS];

// ── 번역 상태 ─────────────────────────────────────────────────────────────────
// content_translations.status
export const TRANSLATION_STATUS = {
  PENDING:   "pending",
  STREAMING: "streaming",
  COMPLETED: "completed",
  FAILED:    "failed",
} as const;

export type TranslationStatus = (typeof TRANSLATION_STATUS)[keyof typeof TRANSLATION_STATUS];

// ── 구독 결제 이벤트 kind ─────────────────────────────────────────────────────
// subscription_history.kind (Phase 5 신설 테이블)
export const SUBSCRIPTION_HISTORY_KIND = {
  ACTIVATED:            "activated",            // 신규 구독 첫 결제
  RENEWED:              "renewed",              // 정기 갱신 결제
  DOWNGRADE_SCHEDULED:  "downgrade_scheduled",  // 다운그레이드 예약 기록
  DOWNGRADED:           "downgraded",           // 다운그레이드 실제 적용
  BILLING_KEY_REPLACED: "billing_key_replaced", // 빌링키 교체 (새 subscription 행)
  RESUBSCRIBED:         "resubscribed",         // 만료·해지 후 재구독
} as const;

export type SubscriptionHistoryKind =
  (typeof SUBSCRIPTION_HISTORY_KIND)[keyof typeof SUBSCRIPTION_HISTORY_KIND];

// ── 구독 상태변경 이력 reason ─────────────────────────────────────────────────
// subscription_status_history.reason (Phase 4에서 테이블 추가 예정)
export const SUBSCRIPTION_HISTORY_REASON = {
  INITIAL_ACTIVATION:     "initial_activation",
  PAYMENT_SUCCESS:        "payment_success",
  PAYMENT_FAIL_PERMANENT: "payment_fail_permanent",
  PAYMENT_METHOD_UPDATE:  "payment_method_update",
  CANCEL_SCHEDULED:       "cancel_scheduled",
  CANCEL_IMMEDIATE:       "cancel_immediate",
  FINALIZED_CANCEL:       "finalized_cancel",
  ORG_SOFT_DELETE:        "org_soft_delete",
  ORG_RESTORE:            "org_restore",
  ORG_HARD_DELETE:        "org_hard_delete",
  USER_DELETE:            "user_delete",
  PAYER_LEFT:             "payer_left",
  PLAN_UPGRADED:          "plan_upgraded",
  DOWNGRADE_SCHEDULED:    "downgrade_scheduled",
  DOWNGRADE_APPLIED:      "downgrade_applied",
} as const;

export type SubscriptionHistoryReason = (typeof SUBSCRIPTION_HISTORY_REASON)[keyof typeof SUBSCRIPTION_HISTORY_REASON];
