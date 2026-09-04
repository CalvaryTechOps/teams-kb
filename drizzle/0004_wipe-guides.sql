-- Pre-production reset before the BlockNote switch: guide bodies change format
-- from Markdown to BlockNote JSON and nothing is migrated. Deleting guides
-- cascades to guide_revision, guide_tag, guide_audience_group and
-- all_staff_request. Categories, spaces, groups, users and auth rows are kept.
DELETE FROM "guide";--> statement-breakpoint
DELETE FROM "guide_deletion_request";--> statement-breakpoint
DELETE FROM "tag";
