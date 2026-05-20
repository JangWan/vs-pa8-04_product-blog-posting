CREATE TABLE "subscription_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"from_status" varchar(20),
	"to_status" varchar(20) NOT NULL,
	"billing_key_changed" boolean DEFAULT false NOT NULL,
	"from_payer_user_id" text,
	"to_payer_user_id" text,
	"changed_by" text NOT NULL,
	"reason" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_organization_id_unique";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "payment_customer_key" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "member_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payer_user_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payer_warning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "org_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "scheduled_plan" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "upgraded_from" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "upgraded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "override_generations" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "override_translations" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "override_agent_runs" integer;--> statement-breakpoint
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sub_status_history_subscription_id_idx" ON "subscription_status_history" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "sub_status_history_created_at_idx" ON "subscription_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_active_per_org_uk" ON "subscriptions" USING btree ("organization_id") WHERE status <> 'canceled';