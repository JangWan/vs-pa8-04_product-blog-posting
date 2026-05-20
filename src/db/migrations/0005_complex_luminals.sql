CREATE TABLE "cron_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"cron_code" varchar(50) NOT NULL,
	"qstash_message_id" text,
	"triggered_by" varchar(20) DEFAULT 'schedule' NOT NULL,
	"triggered_by_user_id" text,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"result_summary" jsonb,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"plan_code" varchar(20) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 0) NOT NULL,
	"used_quantity" integer DEFAULT 0 NOT NULL,
	"cancelled_quantity" integer DEFAULT 0 NOT NULL,
	"period_months" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50) NOT NULL,
	"changed_by" text NOT NULL,
	"reason" text,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" text,
	"kind" varchar(30) DEFAULT 'new_subscription' NOT NULL,
	"status" varchar(50) DEFAULT 'ORDER' NOT NULL,
	"total_amount" numeric(12, 0) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_cancel_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"requested_by" text NOT NULL,
	"requested_items" jsonb,
	"refund_amount" numeric(12, 0) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decided_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_cancels" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_key" varchar(200) NOT NULL,
	"cancel_request_id" text,
	"cancel_amount" numeric(12, 0) NOT NULL,
	"transaction_key" text,
	"canceled_at" timestamp with time zone NOT NULL,
	"raw_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" varchar(64),
	"type" varchar(50) NOT NULL,
	"request_body" jsonb,
	"response_body" jsonb,
	"status_code" integer,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_key" varchar(200) NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"method" text,
	"status" varchar(50) NOT NULL,
	"amount" numeric(12, 0) NOT NULL,
	"balance_amount" numeric(12, 0) NOT NULL,
	"approved_at" timestamp with time zone,
	"raw_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_payment_key_unique" UNIQUE("payment_key")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan" text DEFAULT 'pro' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_key_encrypted" text,
	"next_billing_at" timestamp with time zone,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_scheduled_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"past_due_since" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "usage_quotas" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period_month" varchar(7) NOT NULL,
	"generations_used" integer DEFAULT 0 NOT NULL,
	"translations_used" integer DEFAULT 0 NOT NULL,
	"agent_runs_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_cancel_requests" ADD CONSTRAINT "payment_cancel_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_cancel_requests" ADD CONSTRAINT "payment_cancel_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_cancels" ADD CONSTRAINT "payment_cancels_payment_key_payments_payment_key_fk" FOREIGN KEY ("payment_key") REFERENCES "public"."payments"("payment_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_cancels" ADD CONSTRAINT "payment_cancels_cancel_request_id_payment_cancel_requests_id_fk" FOREIGN KEY ("cancel_request_id") REFERENCES "public"."payment_cancel_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_quotas" ADD CONSTRAINT "usage_quotas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cron_runs_cron_code_idx" ON "cron_runs" USING btree ("cron_code");--> statement-breakpoint
CREATE INDEX "cron_runs_started_at_idx" ON "cron_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_organization_id_idx" ON "orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_expires_at_idx" ON "orders" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "payment_cancel_requests_order_id_idx" ON "payment_cancel_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_cancel_requests_status_idx" ON "payment_cancel_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_cancels_payment_key_idx" ON "payment_cancels" USING btree ("payment_key");--> statement-breakpoint
CREATE INDEX "payment_logs_order_id_idx" ON "payment_logs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_logs_type_idx" ON "payment_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "payment_logs_created_at_idx" ON "payment_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_next_billing_idx" ON "subscriptions" USING btree ("status","next_billing_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_quotas_org_period_uk" ON "usage_quotas" USING btree ("organization_id","period_month");--> statement-breakpoint
CREATE INDEX "usage_quotas_organization_id_idx" ON "usage_quotas" USING btree ("organization_id");