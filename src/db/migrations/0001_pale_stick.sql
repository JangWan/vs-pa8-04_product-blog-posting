CREATE TABLE "content_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"snapshot_body" text NOT NULL,
	"snapshot_seo_meta" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "source_lang" varchar(2) DEFAULT 'ko' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_versions_content_id_version_no_uk" ON "content_versions" USING btree ("content_id","version_no");--> statement-breakpoint
CREATE INDEX "content_versions_content_id_created_at_idx" ON "content_versions" USING btree ("content_id","created_at");