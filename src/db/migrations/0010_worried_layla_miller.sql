CREATE TABLE "plan_products" (
	"id" text PRIMARY KEY NOT NULL,
	"team_type" varchar(20) NOT NULL,
	"plan_code" varchar(20) NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 0) DEFAULT '0' NOT NULL,
	"max_members" integer,
	"generations_per_month" integer DEFAULT 0 NOT NULL,
	"translations_per_month" integer DEFAULT 0 NOT NULL,
	"agent_runs_per_month" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_history" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"kind" varchar(30) NOT NULL,
	"plan_product_id" text,
	"target_plan_product_id" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"next_billing_at" timestamp with time zone,
	"order_id" varchar(64),
	"changed_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "plan_product_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" varchar(10) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_product_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "card_last4" varchar(4);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "card_company" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_plan_product_id" text;--> statement-breakpoint
ALTER TABLE "usage_quotas" ADD COLUMN "plan_product_id" text;--> statement-breakpoint
ALTER TABLE "usage_quotas" ADD COLUMN "generations_limit" integer;--> statement-breakpoint
ALTER TABLE "usage_quotas" ADD COLUMN "translations_limit" integer;--> statement-breakpoint
ALTER TABLE "usage_quotas" ADD COLUMN "agent_runs_limit" integer;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_plan_product_id_plan_products_id_fk" FOREIGN KEY ("plan_product_id") REFERENCES "public"."plan_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_target_plan_product_id_plan_products_id_fk" FOREIGN KEY ("target_plan_product_id") REFERENCES "public"."plan_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_products_team_type_plan_code_uk" ON "plan_products" USING btree ("team_type","plan_code");--> statement-breakpoint
CREATE INDEX "plan_products_is_active_idx" ON "plan_products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "subscription_history_subscription_id_idx" ON "subscription_history" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_history_organization_id_idx" ON "subscription_history" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_history_kind_idx" ON "subscription_history" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "subscription_history_created_at_idx" ON "subscription_history" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_plan_product_id_plan_products_id_fk" FOREIGN KEY ("plan_product_id") REFERENCES "public"."plan_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_plan_product_id_plan_products_id_fk" FOREIGN KEY ("plan_product_id") REFERENCES "public"."plan_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_product_id_plan_products_id_fk" FOREIGN KEY ("pending_plan_product_id") REFERENCES "public"."plan_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_quotas" ADD CONSTRAINT "usage_quotas_plan_product_id_plan_products_id_fk" FOREIGN KEY ("plan_product_id") REFERENCES "public"."plan_products"("id") ON DELETE set null ON UPDATE no action;