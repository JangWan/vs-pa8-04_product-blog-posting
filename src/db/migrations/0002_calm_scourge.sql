CREATE TABLE "content_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"target_lang" varchar(2) NOT NULL,
	"translated_body" text DEFAULT '' NOT NULL,
	"translated_seo_meta" json DEFAULT '{"title":"","description":"","slug":"","keywords":[]}'::json NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_translations_content_id_target_lang_uk" ON "content_translations" USING btree ("content_id","target_lang");