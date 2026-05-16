import {
  pgTable,
  text,
  timestamp,
  json,
  boolean,
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
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type Guideline = typeof guidelines.$inferSelect;
export type Content = typeof contents.$inferSelect;

export type SeoMeta = {
  title: string;
  description: string;
  slug: string;
  keywords: string[];
};
