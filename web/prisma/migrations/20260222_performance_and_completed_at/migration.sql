-- Add completion timestamp fields for task/subtask analytics
ALTER TABLE todo_tasks
  ADD COLUMN IF NOT EXISTS completed_at TEXT;

ALTER TABLE todo_subtasks
  ADD COLUMN IF NOT EXISTS completed_at TEXT;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_todo_tasks_user_scheduled_date
  ON todo_tasks(user_email, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_todo_tasks_user_is_done
  ON todo_tasks(user_email, is_done);

CREATE INDEX IF NOT EXISTS idx_todo_tasks_google_event
  ON todo_tasks(google_event_id);

CREATE INDEX IF NOT EXISTS idx_todo_subtasks_user_task
  ON todo_subtasks(user_email, task_id);
