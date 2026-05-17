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
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const guidelines = pgTable("guidelines", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  is_default: boolean("is_default").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const contents = pgTable("contents", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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
});

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

export type User = typeof users.$inferSelect;
export type Guideline = typeof guidelines.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type ContentTranslation = typeof contentTranslations.$inferSelect;

export type SeoMeta = {
  title: string;
  description: string;
  slug: string;
  keywords: string[];
};
