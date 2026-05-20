// 빌링 도메인 상수 — 주문 상태/가드는 src/lib/constants.ts에서 re-export
// Phase 6: PLANS 상수 제거 — plan_products 테이블(DB)로 완전 이관
export {
  ORDER_STATUS,
  ORDER_KIND,
  CLIENT_TRANSITION_STATUSES,
  ACTIVATABLE_STATUSES,
  CANCELED_STATUSES,
  AUTO_SYNC_STATUSES,
  PAID_STATUSES,
  TOSS_STATUS_MAP,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_HISTORY_REASON,
  SUBSCRIPTION_HISTORY_KIND,
  PLAN_CODE,
  type OrderStatus,
  type OrderKind,
  type SubscriptionStatus,
  type SubscriptionHistoryReason,
  type SubscriptionHistoryKind,
  type PlanCode,
} from "@/lib/constants";
