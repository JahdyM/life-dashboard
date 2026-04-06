CREATE TABLE IF NOT EXISTS "mood_moment_entries" (
  "id" TEXT NOT NULL,
  "user_email" TEXT NOT NULL,
  "day_iso" TEXT NOT NULL,
  "logged_at" TEXT NOT NULL,
  "mood_category" TEXT NOT NULL,
  "mood_note" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "mood_moment_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mood_moment_entries_user_email_day_iso_logged_at_idx"
  ON "mood_moment_entries"("user_email", "day_iso", "logged_at");

CREATE INDEX IF NOT EXISTS "mood_moment_entries_user_email_logged_at_idx"
  ON "mood_moment_entries"("user_email", "logged_at");
