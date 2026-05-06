ALTER TABLE todo_tasks
  ADD COLUMN IF NOT EXISTS missed_at TEXT;

CREATE INDEX IF NOT EXISTS todo_tasks_user_missed_idx
  ON todo_tasks(user_email, missed_at);
