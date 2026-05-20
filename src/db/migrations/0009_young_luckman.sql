ALTER TABLE "organizations" RENAME COLUMN "is_personal" TO "is_default";--> statement-breakpoint
DROP INDEX "organizations_is_personal_idx";--> statement-breakpoint
CREATE INDEX "organizations_is_default_idx" ON "organizations" USING btree ("is_default");