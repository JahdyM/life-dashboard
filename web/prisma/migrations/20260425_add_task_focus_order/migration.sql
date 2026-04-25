ALTER TABLE todo_task_details
  ADD COLUMN IF NOT EXISTS focus_order INTEGER;

CREATE INDEX IF NOT EXISTS todo_task_details_user_focus_order_idx
  ON todo_task_details(user_email, focus_order);
