ALTER TABLE "guide_deletion_request" ADD COLUMN "prior_status" "guide_status";--> statement-breakpoint
ALTER TABLE "guide_deletion_request" ADD COLUMN "reason" text;