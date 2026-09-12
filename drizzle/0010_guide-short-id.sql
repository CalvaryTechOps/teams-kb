-- Permanent short ids for /a/{shortId} (plans/guide-permalinks.md §1).
-- drizzle-kit emitted "ADD COLUMN … NOT NULL", which no existing row can
-- satisfy, so the column is added nullable, backfilled, then constrained.
ALTER TABLE "guide" ADD COLUMN "short_id" text;--> statement-breakpoint
-- Same alphabet and length as src/lib/short-id.ts (the one other place these
-- are written down): digits 2-9 and consonants except l, five characters.
-- Re-roll on the rare collision. A raw UPDATE leaves updated_at alone, so the
-- backfill does not make every guide look freshly edited.
DO $$
DECLARE
  alphabet constant text := '23456789bcdfghjkmnpqrstvwxz';
  id_length constant int := 5;
  r record;
  candidate text;
BEGIN
  FOR r IN SELECT id FROM guide WHERE short_id IS NULL LOOP
    LOOP
      SELECT string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
        INTO candidate
        FROM generate_series(1, id_length);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM guide WHERE short_id = candidate);
    END LOOP;
    UPDATE guide SET short_id = candidate WHERE id = r.id;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "guide" ALTER COLUMN "short_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "guide_short_id_idx" ON "guide" USING btree ("short_id");
