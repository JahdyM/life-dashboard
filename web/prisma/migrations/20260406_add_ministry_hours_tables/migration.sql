CREATE TABLE IF NOT EXISTS "monthly_goals" (
  "id" TEXT NOT NULL,
  "user_email" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "target_minutes" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "monthly_goals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "monthly_goals_user_email_year_month_key"
  ON "monthly_goals"("user_email", "year", "month");

CREATE INDEX IF NOT EXISTS "monthly_goals_user_email_year_month_idx"
  ON "monthly_goals"("user_email", "year", "month");

CREATE TABLE IF NOT EXISTS "daily_service_entries" (
  "id" TEXT NOT NULL,
  "user_email" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "goal_minutes" INTEGER,
  "actual_minutes" INTEGER,
  "notes" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "daily_service_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_service_entries_user_email_date_key"
  ON "daily_service_entries"("user_email", "date");

CREATE INDEX IF NOT EXISTS "daily_service_entries_user_email_date_idx"
  ON "daily_service_entries"("user_email", "date");
