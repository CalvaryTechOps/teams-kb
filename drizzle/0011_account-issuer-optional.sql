DROP INDEX "account_issuer_accountId_idx";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "account_providerId_accountId_idx" ON "account" USING btree ("provider_id","account_id");