import {
  pgTable,
  text,
  timestamp,
  json,
  jsonb,
  boolean,
  integer,
  numeric,
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  clerk_user_id: text("clerk_user_id").unique().notNull(),
  email: text("email").notNull(),
  plan: text("plan").notNull().default("free"),
  // Phase 3: 기본 조직 (마지막 로그인 시 진입 조직) — FK는 organizations 정의 후 추가
  default_organization_id: text("default_organization_id"),
  // Phase 3: 토스페이먼츠 고객 키 (permanent, 정기결제용)
  payment_customer_key: text("payment_customer_key"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const guidelines = pgTable(
  "guidelines",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Phase 3: 조직 공용 소유권 (BR-34) — nullable: 백필 전 기존 데이터
    organization_id: text("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" }
    ),
    // Phase 3: 작성자 (조직 공용이어도 누가 만들었는지 표시)
    created_by: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    is_default: boolean("is_default").notNull().default(false),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("guidelines_organization_id_idx").on(table.organization_id),
    index("guidelines_user_id_idx").on(table.user_id),
  ]
);

export const contents = pgTable(
  "contents",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Phase 3: 조직 소유권 — nullable: 백필 전 기존 데이터
    organization_id: text("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" }
    ),
    guideline_id: text("guideline_id").references(() => guidelines.id, {
      onDelete: "set null",
    }),
    topic: text("topic").notNull(),
    keywords: json("keywords").notNull().default([]),
    direction: text("direction"),
    body: text("body").notNull(),
    seo_meta: json("seo_meta").notNull(),
    // Phase 2: 원문 언어 (번역 from/to 결정용, 기본 'ko')
    source_lang: varchar("source_lang", { length: 2 }).notNull().default("ko"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("contents_organization_id_idx").on(table.organization_id),
    index("contents_user_id_idx").on(table.user_id),
  ]
);

// Phase 2: 콘텐츠 버전 스냅샷 (BR-18 자동, UC-17 수동, BR-19 복원 안전장치)
export const contentVersions = pgTable(
  "content_versions",
  {
    id: text("id").primaryKey(),
    content_id: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    version_no: integer("version_no").notNull(),
    snapshot_body: text("snapshot_body").notNull(),
    snapshot_seo_meta: json("snapshot_seo_meta").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("content_versions_content_id_version_no_uk").on(
      table.content_id,
      table.version_no,
    ),
    index("content_versions_content_id_created_at_idx").on(
      table.content_id,
      table.created_at,
    ),
  ],
);

// Phase 2: 다국어 번역본 (콘텐츠+언어당 최대 1행)
export const contentTranslations = pgTable(
  "content_translations",
  {
    id: text("id").primaryKey(),
    content_id: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    target_lang: varchar("target_lang", { length: 2 }).notNull(),
    translated_body: text("translated_body").notNull().default(""),
    translated_seo_meta: json("translated_seo_meta")
      .notNull()
      .default({ title: "", description: "", slug: "", keywords: [] }),
    /* status: 'pending' | 'streaming' | 'completed' | 'failed' */
    status: text("status").notNull().default("pending"),
    error_message: text("error_message"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("content_translations_content_id_target_lang_uk").on(
      table.content_id,
      table.target_lang,
    ),
  ],
);

// Phase 3: 조직(팀) 관리 (Clerk Organizations 1:1 동기화)
// soft delete: deleted_at IS NOT NULL이면 30일 grace 진입
export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    // Clerk org_id (Personal Org도 생성 필수)
    clerk_org_id: text("clerk_org_id").unique().notNull(),
    name: text("name").notNull(),
    // URL 친화 식별자
    slug: text("slug").unique().notNull(),
    // 생성자 (Personal Org는 본인)
    owner_user_id: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // true=기본 팀(Personal Org) — 멤버 초대·삭제 불가, 영구 플래그
    is_default: boolean("is_default").notNull().default(false),
    // soft delete: 30일 grace 기간
    deleted_at: timestamp("deleted_at"),
    // Phase 4: 팀 구독용 Toss customerKey (개인 org는 users.payment_customer_key 사용)
    payment_customer_key: text("payment_customer_key"),
    // Phase 4: 현재 멤버 수 — 초대 캡 검증 및 quota 결정용 (JOIN 없이 조회)
    member_count: integer("member_count").notNull().default(1),
    // Phase 5: 현재 플랜 상품 FK (plan 컬럼과 병행 유지, Phase 6에서 plan 컬럼 DROP)
    plan_product_id: text("plan_product_id").references(() => planProducts.id, { onDelete: "set null" }),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("organizations_clerk_org_id_uk").on(table.clerk_org_id),
    uniqueIndex("organizations_slug_uk").on(table.slug),
    index("organizations_owner_user_id_idx").on(table.owner_user_id),
    index("organizations_is_default_idx").on(table.is_default),
    index("organizations_deleted_at_idx").on(table.deleted_at),
  ]
);

// Phase 3: Webhook 멱등성 보장 (Toss/Clerk 중복 처리 방지)
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    // event_id: UNIQUE (Clerk svix-id, Toss eventId, Upstash-Message-Id)
    event_id: text("event_id").unique().notNull(),
    // provider: 'clerk' | 'toss' | 'qstash'
    provider: text("provider").notNull(),
    event_type: text("event_type").notNull(),
    payload: json("payload"),
    processed_at: timestamp("processed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("webhook_events_event_id_uk").on(table.event_id),
    index("webhook_events_provider_idx").on(table.provider),
  ]
);

// Phase 3: 조직 멤버 관계 (Clerk OrganizationMembership 동기화)
export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Clerk 'org:admin' / 'org:member' 매핑
    role: text("role").notNull().default("member"),
    // 초대자 (Personal Org는 NULL)
    invited_by: text("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    joined_at: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex(
      "organization_members_organization_id_user_id_uk"
    ).on(table.organization_id, table.user_id),
    index("organization_members_organization_id_idx").on(
      table.organization_id
    ),
    index("organization_members_user_id_idx").on(table.user_id),
    index("organization_members_role_idx").on(table.role),
  ]
);

// Phase 5: 플랜 상품 카탈로그 (PLANS 상수의 DB화 — team_type × plan_code 조합)
export const planProducts = pgTable(
  "plan_products",
  {
    id: text("id").primaryKey(),
    team_type: varchar("team_type", { length: 20 }).notNull(), // 'personal' | 'team'
    plan_code: varchar("plan_code", { length: 20 }).notNull(), // 'free' | 'pro' | 'max'
    name: text("name").notNull(),
    price: numeric("price", { precision: 12, scale: 0 }).notNull().default("0"),
    max_members: integer("max_members"), // NULL = 무제한
    generations_per_month: integer("generations_per_month").notNull().default(0),
    translations_per_month: integer("translations_per_month").notNull().default(0),
    agent_runs_per_month: integer("agent_runs_per_month").notNull().default(0),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("plan_products_team_type_plan_code_uk").on(table.team_type, table.plan_code),
    index("plan_products_is_active_idx").on(table.is_active),
  ]
);

// Phase 3: 구독 (조직당 1행, 빌링키 암호화 보관)
// Phase 6: plan/scheduled_plan/override_*/upgraded_* 제거 → plan_product_id FK로 통합
// status: → src/lib/constants.ts SUBSCRIPTION_STATUS 참조
//   'active'           — 정상 구독 (billing_key 있음)
//   'suspended'        — billing_key 없음, 결제 수단 재등록 필요
//   'past_due'         — 정기결제 실패 (3일 grace, billing_key 있음)
//   'cancel_scheduled' — 해지 예약됨 (current_period_end 만료 후 canceled)
//   'canceled'         — 취소 완료 (이력 보존용)
// cancel_scheduled_at: 해지 예약 요청 시각 (상태 확인 불필요, 감사·복원 계산용)
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    // UNIQUE는 취소된 이력을 여러 행으로 보존하기 위해 부분 인덱스로 교체
    // (canceled 제외한 상태는 org당 1행만 허용)
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Phase 6: 현재 구독 플랜 상품 FK (plan 컬럼 대체)
    plan_product_id: text("plan_product_id").references(() => planProducts.id, { onDelete: "set null" }),
    // SUBSCRIPTION_STATUS 참조: 'active' | 'suspended' | 'past_due' | 'cancel_scheduled' | 'canceled'
    status: text("status").notNull().default("active"),
    // AES-256-GCM 암호화된 Toss 빌링키 (suspended/canceled 시 NULL)
    billing_key_encrypted: text("billing_key_encrypted"),
    // Toss customerKey 역정규화 (cron JOIN 불필요)
    // 개인 org: users.payment_customer_key / 팀 org: organizations.payment_customer_key
    customer_key: text("customer_key"),
    // 결제 등록자 user_id (탈퇴 경고 및 결제 책임 추적)
    payer_user_id: text("payer_user_id"),
    // 결제자 팀 탈퇴 시 true → billing 페이지 경고 배너
    payer_warning: boolean("payer_warning").notNull().default(false),
    // 조직 soft-delete 시각 (cron 결제 차단 + 복구 감지용 역정규화)
    org_deleted_at: timestamp("org_deleted_at", { withTimezone: true }),
    // 다음 결제 시 적용할 플랜 상품 FK (MAX→Pro 다운그레이드 예약 시 Pro 상품 ID 저장)
    pending_plan_product_id: text("pending_plan_product_id").references(() => planProducts.id, { onDelete: "set null" }),
    // 다음 정기결제 시각 (cancel_scheduled 시 NULL — cron이 재청구 안 함)
    next_billing_at: timestamp("next_billing_at", { withTimezone: true }),
    // 현재 구독 기간 종료 시각
    current_period_end: timestamp("current_period_end", { withTimezone: true }).notNull(),
    // 해지 예약 요청 시각 (상태 확인 아닌 감사·복원 계산용)
    cancel_scheduled_at: timestamp("cancel_scheduled_at", { withTimezone: true }),
    // 실제 취소 완결 시각
    canceled_at: timestamp("canceled_at", { withTimezone: true }),
    // past_due 진입 시각 (3일 grace 계산 기준)
    past_due_since: timestamp("past_due_since", { withTimezone: true }),
    // Phase 5: 카드 정보 역정규화 (결제 수단 변경 시 갱신)
    card_last4: varchar("card_last4", { length: 4 }),
    card_company: text("card_company"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // canceled 제외 상태는 org당 1개만 허용 (이력 보존 위한 부분 인덱스)
    uniqueIndex("subscriptions_one_active_per_org_uk")
      .on(table.organization_id)
      .where(sql`status <> 'canceled'`),
    index("subscriptions_organization_id_idx").on(table.organization_id),
    index("subscriptions_status_next_billing_idx").on(table.status, table.next_billing_at),
  ]
);

// Phase 4: 구독 상태 변경 이력 (분쟁 증빙·감사용)
// reason → src/lib/constants.ts SUBSCRIPTION_HISTORY_REASON 참조
export const subscriptionStatusHistory = pgTable(
  "subscription_status_history",
  {
    id: text("id").primaryKey(),
    subscription_id: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    // NULL = 최초 생성
    from_status: varchar("from_status", { length: 20 }),
    to_status: varchar("to_status", { length: 20 }).notNull(),
    // 결제 수단 변경 여부 (billing_key 교체 시 true)
    billing_key_changed: boolean("billing_key_changed").notNull().default(false),
    from_payer_user_id: text("from_payer_user_id"),
    to_payer_user_id: text("to_payer_user_id"),
    // user_id | 'cron' | 'webhook' | 'system'
    changed_by: text("changed_by").notNull(),
    reason: varchar("reason", { length: 50 }).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sub_status_history_subscription_id_idx").on(table.subscription_id),
    index("sub_status_history_created_at_idx").on(table.created_at),
  ]
);

// Phase 3: 조직별 월간 사용량 카운터 (BR-32)
// period_month: 'YYYY-MM' KST 형식
export const usageQuotas = pgTable(
  "usage_quotas",
  {
    id: text("id").primaryKey(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // 'YYYY-MM' KST 기준
    period_month: varchar("period_month", { length: 7 }).notNull(),
    generations_used: integer("generations_used").notNull().default(0),
    translations_used: integer("translations_used").notNull().default(0),
    agent_runs_used: integer("agent_runs_used").notNull().default(0),
    // Phase 5: 결제 시점 플랜 한도 스냅샷 (이후 상품 가격/한도 변경에 소급 적용 방지)
    plan_product_id: text("plan_product_id").references(() => planProducts.id, { onDelete: "set null" }),
    generations_limit: integer("generations_limit"),
    translations_limit: integer("translations_limit"),
    agent_runs_limit: integer("agent_runs_limit"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("usage_quotas_org_period_uk").on(table.organization_id, table.period_month),
    index("usage_quotas_organization_id_idx").on(table.organization_id),
  ]
);

// Phase 3: 결제 주문 (단건·정기 공통, Toss 11상태)
// id는 VARCHAR(64) 문자열 — Toss orderId와 동일 (UUID uuid 타입 사용 불가)
// kind: 'new_subscription' | 'recurring' | 'plan_change'
// status: ORDER | AUTH_READY | AUTH_SUCCESS | AUTH_CANCEL | AUTH_FAIL |
//         PAY_SUCCESS | PAY_FAIL | PAY_WAITING | PAY_EXPIRED | PAY_CANCELED | PAY_CANCELED_PARTIAL
export const orders = pgTable(
  "orders",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subscription_id: text("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    // 주문 종류
    kind: varchar("kind", { length: 30 }).notNull().default("new_subscription"),
    // 11개 내부 상태
    status: varchar("status", { length: 50 }).notNull().default("ORDER"),
    // 결제 금액 (NUMERIC — KRW 정수)
    total_amount: numeric("total_amount", { precision: 12, scale: 0 }).notNull(),
    // 주문 만료 시각 (+30분, cron이 PAY_EXPIRED 처리)
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    // JSONB 메타 (plan_change 시 from_plan, to_plan, proration_amount 등)
    metadata: jsonb("metadata"),
    // Phase 5: 주문 생성 주체 구분
    source: varchar("source", { length: 10 }).notNull().default("user"), // 'user' | 'cron'
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("orders_organization_id_idx").on(table.organization_id),
    index("orders_status_idx").on(table.status),
    index("orders_expires_at_idx").on(table.expires_at),
  ]
);

// Phase 3: 주문 상품 라인
export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    order_id: varchar("order_id", { length: 64 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // 구독은 항상 1
    quantity: integer("quantity").notNull().default(1),
    unit_price: numeric("unit_price", { precision: 12, scale: 0 }).notNull(),
    // 환불 계산용: 사용된 수량 (콘텐츠 복사/다운로드 시 증가)
    used_quantity: integer("used_quantity").notNull().default(0),
    // 이미 취소된 수량
    cancelled_quantity: integer("cancelled_quantity").notNull().default(0),
    // 구독은 1개월 고정
    period_months: integer("period_months").notNull().default(1),
    // Phase 5: 플랜 상품 FK (plan_code 컬럼과 병행, Phase 6에서 plan_code DROP)
    plan_product_id: text("plan_product_id").references(() => planProducts.id, { onDelete: "set null" }),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.order_id),
  ]
);

// Phase 5: 구독 결제 주기 이벤트 로그 (subscriptionStatusHistory와 별개)
// kind → src/lib/constants.ts SUBSCRIPTION_HISTORY_KIND 참조
export const subscriptionHistory = pgTable(
  "subscription_history",
  {
    id: text("id").primaryKey(),
    subscription_id: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    // organization_id 역정규화: JOIN 없이 이력 조회
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).notNull(),
    plan_product_id: text("plan_product_id")
      .references(() => planProducts.id, { onDelete: "set null" }),
    target_plan_product_id: text("target_plan_product_id")
      .references(() => planProducts.id, { onDelete: "set null" }),
    period_start: timestamp("period_start", { withTimezone: true }),
    period_end: timestamp("period_end", { withTimezone: true }),
    next_billing_at: timestamp("next_billing_at", { withTimezone: true }),
    // 단방향 FK만 유지 (circular FK 방지)
    order_id: varchar("order_id", { length: 64 })
      .references(() => orders.id, { onDelete: "set null" }),
    changed_by: text("changed_by").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("subscription_history_subscription_id_idx").on(table.subscription_id),
    index("subscription_history_organization_id_idx").on(table.organization_id),
    index("subscription_history_kind_idx").on(table.kind),
    index("subscription_history_created_at_idx").on(table.created_at),
  ]
);

// Phase 3: 주문 상태 변경 감사 이력
// changed_by: user_id | 'system' | 'webhook' | 'cron'
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: text("id").primaryKey(),
    order_id: varchar("order_id", { length: 64 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    from_status: varchar("from_status", { length: 50 }),
    to_status: varchar("to_status", { length: 50 }).notNull(),
    changed_by: text("changed_by").notNull(),
    reason: text("reason"),
    changed_at: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => [
    index("order_status_history_order_id_idx").on(table.order_id),
  ]
);

// Phase 3: Toss Payment 객체 보관
// payment_key: VARCHAR(200) UNIQUE — Toss paymentKey
// status: Toss 공식 8종 (DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED, WAITING_FOR_DEPOSIT 등)
export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    payment_key: varchar("payment_key", { length: 200 }).unique().notNull(),
    order_id: varchar("order_id", { length: 64 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // 결제 수단 ('카드', '가상계좌' 등)
    method: text("method"),
    // Toss 공식 상태 enum
    status: varchar("status", { length: 50 }).notNull(),
    // 결제 금액
    amount: numeric("amount", { precision: 12, scale: 0 }).notNull(),
    // 취소 가능 잔액 (부분 취소 후 감소)
    balance_amount: numeric("balance_amount", { precision: 12, scale: 0 }).notNull(),
    // Toss 승인 시각
    approved_at: timestamp("approved_at", { withTimezone: true }),
    // Toss Payment 객체 전체 (영수증 URL 등 사후 조회용)
    raw_data: jsonb("raw_data").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("payments_order_id_idx").on(table.order_id),
  ]
);

// Phase 3: 모든 Toss API 요청/응답/에러 감사 로그 (BR-35-d)
// type 예시: CONFIRM_REQ | CONFIRM_RES | CONFIRM_ERR | CANCEL_REQ | CANCEL_RES | CANCEL_ERR |
//           SYNC_REQ | SYNC_RES | SYNC_ERR | BILLING_KEY_ISSUE_REQ | BILLING_KEY_ISSUE_RES |
//           BILLING_KEY_DELETE_REQ | BILLING_KEY_DELETE_RES | RECURRING_CHARGE_REQ | RECURRING_CHARGE_RES | RECURRING_CHARGE_ERR
export const paymentLogs = pgTable(
  "payment_logs",
  {
    id: text("id").primaryKey(),
    order_id: varchar("order_id", { length: 64 }),
    // 로그 유형 (REQ/RES/ERR 3종 × 각 작업)
    type: varchar("type", { length: 50 }).notNull(),
    request_body: jsonb("request_body"),
    response_body: jsonb("response_body"),
    status_code: integer("status_code"),
    error_code: text("error_code"),
    error_message: text("error_message"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("payment_logs_order_id_idx").on(table.order_id),
    index("payment_logs_type_idx").on(table.type),
    index("payment_logs_created_at_idx").on(table.created_at),
  ]
);

// Phase 3: 사용자 취소/환불 요청 (관리자 승인 대기)
// status: 'PENDING' | 'APPROVED' | 'REJECTED'
export const paymentCancelRequests = pgTable(
  "payment_cancel_requests",
  {
    id: text("id").primaryKey(),
    order_id: varchar("order_id", { length: 64 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    requested_by: text("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 환불 대상 항목 (JSONB)
    requested_items: jsonb("requested_items"),
    // 환불 예상액 (calculateRefundAmount 결과)
    refund_amount: numeric("refund_amount", { precision: 12, scale: 0 }).notNull(),
    // 취소 사유
    reason: text("reason").notNull(),
    // 'PENDING' | 'APPROVED' | 'REJECTED'
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    // 관리자 결정 시각·주체·사유
    decided_at: timestamp("decided_at", { withTimezone: true }),
    decided_by: text("decided_by"),
    decided_reason: text("decided_reason"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("payment_cancel_requests_order_id_idx").on(table.order_id),
    index("payment_cancel_requests_status_idx").on(table.status),
  ]
);

// Phase 3: Toss cancel API 결과 (관리자 승인 완료 후 기록)
export const paymentCancels = pgTable(
  "payment_cancels",
  {
    id: text("id").primaryKey(),
    payment_key: varchar("payment_key", { length: 200 })
      .notNull()
      .references(() => payments.payment_key, { onDelete: "cascade" }),
    cancel_request_id: text("cancel_request_id").references(
      () => paymentCancelRequests.id,
      { onDelete: "set null" }
    ),
    cancel_amount: numeric("cancel_amount", { precision: 12, scale: 0 }).notNull(),
    // Toss 취소 트랜잭션 키
    transaction_key: text("transaction_key"),
    canceled_at: timestamp("canceled_at", { withTimezone: true }).notNull(),
    // Toss cancel API 응답 원본
    raw_data: jsonb("raw_data").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("payment_cancels_payment_key_idx").on(table.payment_key),
  ]
);

// Phase 3: cron 실행 이력 (UC-39 SystemAdmin 운영 가시화)
// cron_code: 'billing/tick' | 'billing/expire-orders' | 'billing/finalize-canceled' | 'quota/reset' | 'org/purge' | 'manual'
// status: 'running' | 'completed' | 'failed'
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: text("id").primaryKey(),
    cron_code: varchar("cron_code", { length: 50 }).notNull(),
    // QStash Upstash-Message-Id (수동 트리거 시 NULL)
    qstash_message_id: text("qstash_message_id"),
    // 'schedule' | 'manual'
    triggered_by: varchar("triggered_by", { length: 20 }).notNull().default("schedule"),
    triggered_by_user_id: text("triggered_by_user_id"),
    // 'running' | 'completed' | 'failed'
    status: varchar("status", { length: 20 }).notNull().default("running"),
    // 실행 결과 요약 (processed, succeeded, failed 등 cron별 커스텀)
    result_summary: jsonb("result_summary"),
    error_message: text("error_message"),
    started_at: timestamp("started_at").defaultNow().notNull(),
    finished_at: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("cron_runs_cron_code_idx").on(table.cron_code),
    index("cron_runs_started_at_idx").on(table.started_at),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Guideline = typeof guidelines.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type ContentTranslation = typeof contentTranslations.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type SubscriptionStatusHistory = typeof subscriptionStatusHistory.$inferSelect;
export type UsageQuota = typeof usageQuotas.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentLog = typeof paymentLogs.$inferSelect;
export type PaymentCancelRequest = typeof paymentCancelRequests.$inferSelect;
export type PaymentCancel = typeof paymentCancels.$inferSelect;
export type CronRun = typeof cronRuns.$inferSelect;
export type PlanProduct = typeof planProducts.$inferSelect;
export type NewPlanProduct = typeof planProducts.$inferInsert;
export type SubscriptionHistory = typeof subscriptionHistory.$inferSelect;
export type NewSubscriptionHistory = typeof subscriptionHistory.$inferInsert;

export type SeoMeta = {
  title: string;
  description: string;
  slug: string;
  keywords: string[];
};
