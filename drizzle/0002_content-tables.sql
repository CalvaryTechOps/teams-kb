CREATE TYPE "public"."all_staff_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."guide_audience" AS ENUM('department', 'groups', 'all_staff');--> statement-breakpoint
CREATE TYPE "public"."guide_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('draft', 'pending', 'published', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "all_staff_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"status" "all_staff_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"category_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" "guide_status" DEFAULT 'draft' NOT NULL,
	"audience" "guide_audience" DEFAULT 'department' NOT NULL,
	"current_revision_id" uuid,
	"search_text" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "guide_audience_group" (
	"guide_id" uuid NOT NULL,
	"group_id" text NOT NULL,
	CONSTRAINT "guide_audience_group_guide_id_group_id_pk" PRIMARY KEY("guide_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "guide_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"content_md" text NOT NULL,
	"status" "revision_status" DEFAULT 'draft' NOT NULL,
	"author_id" text NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "guide_tag" (
	"guide_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "guide_tag_guide_id_tag_id_pk" PRIMARY KEY("guide_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "tag_name_unique" UNIQUE("name"),
	CONSTRAINT "tag_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "all_staff_request" ADD CONSTRAINT "all_staff_request_guide_id_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "all_staff_request" ADD CONSTRAINT "all_staff_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "all_staff_request" ADD CONSTRAINT "all_staff_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_current_revision_id_guide_revision_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."guide_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide" ADD CONSTRAINT "guide_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_audience_group" ADD CONSTRAINT "guide_audience_group_guide_id_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_audience_group" ADD CONSTRAINT "guide_audience_group_group_id_m365_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."m365_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revision" ADD CONSTRAINT "guide_revision_guide_id_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revision" ADD CONSTRAINT "guide_revision_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revision" ADD CONSTRAINT "guide_revision_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_tag" ADD CONSTRAINT "guide_tag_guide_id_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_tag" ADD CONSTRAINT "guide_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "all_staff_request_pending_idx" ON "all_staff_request" USING btree ("guide_id") WHERE "all_staff_request"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "category_space_slug_idx" ON "category" USING btree ("space_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_space_slug_idx" ON "guide" USING btree ("space_id","slug");--> statement-breakpoint
CREATE INDEX "guide_space_status_idx" ON "guide" USING btree ("space_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_guide_version_idx" ON "guide_revision" USING btree ("guide_id","version");--> statement-breakpoint
CREATE INDEX "revision_pending_idx" ON "guide_revision" USING btree ("guide_id") WHERE "guide_revision"."status" = 'pending';