import {
  pgTable,
  text,
  timestamp,
  json,
  boolean,
  integer,
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/pg-core";

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
    // Phase 3: Free/Pro (Team v1.4에서 제거)
    plan: text("plan").notNull().default("free"),
    // true=Personal Org (멤버 초대·삭제 불가)
    is_personal: boolean("is_personal").notNull().default(false),
    // soft delete: 30일 grace 기간
    deleted_at: timestamp("deleted_at"),
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
    index("organizations_is_personal_idx").on(table.is_personal),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Guideline = typeof guidelines.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type ContentTranslation = typeof contentTranslations.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;

export type SeoMeta = {
  title: string;
  description: string;
  slug: string;
  keywords: string[];
};
