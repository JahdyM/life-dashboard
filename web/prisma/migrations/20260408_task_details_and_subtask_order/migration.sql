ALTER TABLE todo_subtasks
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE TABLE IF NOT EXISTS todo_task_details (
  task_id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  planned_time TEXT,
  start_time TEXT,
  end_time TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS todo_task_details_user_email_idx
  ON todo_task_details(user_email);
