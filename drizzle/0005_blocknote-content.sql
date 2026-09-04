ALTER TABLE "guide_revision" DROP COLUMN "content_md";--> statement-breakpoint
ALTER TABLE "guide_revision" ADD COLUMN "content" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_revision" ADD COLUMN "content_version" integer DEFAULT 1 NOT NULL;
