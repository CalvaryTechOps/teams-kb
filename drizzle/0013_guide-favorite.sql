CREATE TABLE "guide_favorite" (
	"user_id" text NOT NULL,
	"guide_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guide_favorite_user_id_guide_id_pk" PRIMARY KEY("user_id","guide_id")
);
--> statement-breakpoint
ALTER TABLE "guide_favorite" ADD CONSTRAINT "guide_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_favorite" ADD CONSTRAINT "guide_favorite_guide_id_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guide_favorite_user_idx" ON "guide_favorite" USING btree ("user_id");