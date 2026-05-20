ALTER TABLE "subscriptions" ADD COLUMN "plan_product_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_product_id_plan_products_id_fk" FOREIGN KEY ("plan_product_id") REFERENCES "public"."plan_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "plan_code";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "scheduled_plan";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "upgraded_from";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "upgraded_at";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "override_generations";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "override_translations";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "override_agent_runs";