ALTER TABLE daily_entries_user
  ADD COLUMN IF NOT EXISTS prayer_on_waking INTEGER;
