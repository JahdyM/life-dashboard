from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta

from backend import repositories
from backend.settings import get_settings
from backend.services import google_calendar_service


def _build_event_payload(task: dict) -> dict:
    settings = get_settings()
    title = task.get("title") or "Untitled task"
    scheduled_date = task.get("scheduled_date")
    scheduled_time = task.get("scheduled_time")
    estimated = int(task.get("estimated_minutes") or 30)
    if scheduled_date and scheduled_time:
        start_dt = f"{scheduled_date}T{scheduled_time}:00"
        end_dt = (
            datetime.fromisoformat(start_dt) + timedelta(minutes=estimated)
        ).strftime("%Y-%m-%dT%H:%M:%S")
        return {
            "summary": title,
            "start": {"dateTime": start_dt, "timeZone": settings.calendar_timezone},
            "end": {"dateTime": end_dt, "timeZone": settings.calendar_timezone},
        }
    if scheduled_date:
        next_day = (datetime.fromisoformat(scheduled_date) + timedelta(days=1)).strftime("%Y-%m-%d")
        return {
            "summary": title,
            "start": {"date": scheduled_date},
            "end": {"date": next_day},
        }
    return {"summary": title}


async def _handle_task_outbox(row: dict) -> None:
    user_email = row["user_email"]
    action = row["action"]
    payload = json.loads(row.get("payload_json") or "{}")
    task_id = row.get("entity_id")

    if action == "create":
        task = await repositories.get_task(user_email, task_id)
        calendar_id = task.get("google_calendar_id") or "primary"
        if not task.get("scheduled_date"):
            return
        if task.get("google_event_id"):
            return
        event = await google_calendar_service.create_event(user_email, calendar_id, _build_event_payload(task))
        await repositories.update_task(
            user_email,
            task_id,
            {"google_calendar_id": calendar_id, "google_event_id": event.get("id")},
        )
        return

    if action == "update":
        task = await repositories.get_task(user_email, task_id)
        calendar_id = task.get("google_calendar_id") or "primary"
        event_id = task.get("google_event_id")
        if not event_id:
            return
        if not task.get("scheduled_date"):
            return
        await google_calendar_service.update_event(
            user_email,
            calendar_id,
            event_id,
            _build_event_payload(task),
        )
        return

    if action == "delete":
        calendar_id = payload.get("google_calendar_id") or "primary"
        event_id = payload.get("google_event_id")
        if event_id:
            await google_calendar_service.delete_event(user_email, calendar_id, event_id)


async def process_outbox_once(limit: int = 25) -> int:
    rows = await repositories.list_pending_outbox(limit=limit)
    if not rows:
        return 0
    for row in rows:
        try:
            if row.get("entity_type") == "task":
                await _handle_task_outbox(row)
            await repositories.mark_outbox_done(row["id"])
        except Exception as exc:
            attempts = int(row.get("attempts") or 0) + 1
            delay = min(300, 2 ** min(attempts, 8))
            next_retry_at = (datetime.utcnow() + timedelta(seconds=delay)).isoformat()
            await repositories.mark_outbox_error(row["id"], attempts, next_retry_at, str(exc))
    return len(rows)


async def run_forever() -> None:
    while True:
        await process_outbox_once(limit=25)
        await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(run_forever())
