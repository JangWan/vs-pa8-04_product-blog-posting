ALTER TABLE "users" DROP CONSTRAINT "users_default_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "guidelines" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "guidelines" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contents_organization_id_idx" ON "contents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contents_user_id_idx" ON "contents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guidelines_organization_id_idx" ON "guidelines" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "guidelines_user_id_idx" ON "guidelines" USING btree ("user_id");