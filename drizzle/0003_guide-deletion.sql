ALTER TYPE "public"."guide_status" ADD VALUE 'deleted';--> statement-breakpoint
CREATE TABLE "guide_deletion_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid,
	"guide_title" text NOT NULL,
	"space_id" uuid,
	"space_name" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" "all_staff_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "guide" ADD COLUMN IF NOT EXISTS "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("guide"."title", '')), 'A') || setweight(to_tsvector('english', coalesce("guide"."search_text", '')), 'B')) STORED;--> statement-breakpoint
ALTER TABLE "guide_deletion_request" ADD CONSTRAINT "guide_deletion_request_guide_id_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_deletion_request" ADD CONSTRAINT "guide_deletion_request_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_deletion_request" ADD CONSTRAINT "guide_deletion_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_deletion_request" ADD CONSTRAINT "guide_deletion_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_request_pending_idx" ON "guide_deletion_request" USING btree ("guide_id") WHERE "guide_deletion_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guide_search_vector_idx" ON "guide" USING gin ("search_vector");