from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from backend.auth import require_user_email
from backend import repositories
from backend.settings import get_settings
from backend.services import google_calendar_service
from backend.workers.sync_worker import process_outbox_once

router = APIRouter()


@router.get("/v1/calendar/week")
async def calendar_week(start: date = Query(...), user_email: str = Depends(require_user_email)):
    end = start + timedelta(days=6)
    items = await repositories.list_tasks(user_email, start.isoformat(), end.isoformat())
    hour_rows = []
    for hour in range(0, 24):
        row = {"hour": f"{hour:02d}:00"}
        for idx in range(7):
            day = start + timedelta(days=idx)
            key = day.isoformat()
            values = []
            for item in items:
                if item.get("scheduled_date") != key:
                    continue
                stime = item.get("scheduled_time")
                if not stime:
                    continue
                if str(stime).startswith(f"{hour:02d}:"):
                    values.append(f"{stime} • {item.get('title')}")
            row[key] = " | ".join(values)
        hour_rows.append(row)
    return {"start_date": start.isoformat(), "days": hour_rows}


@router.post("/v1/calendar/sync/run")
async def trigger_sync(user_email: str = Depends(require_user_email)):
    settings = get_settings()
    calendar_ids = ["primary"] + settings.allowed_calendar_ids(user_email)
    now = datetime.now(timezone.utc)
    time_min = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")
    time_max = (now + timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")

    for calendar_id in calendar_ids:
        cursor = await repositories.get_sync_cursor(user_email, calendar_id)
        sync_token = cursor.get("sync_token") if cursor else None
        response = await google_calendar_service.list_events(user_email, calendar_id, time_min, time_max, sync_token)
        items = response.get("items") or []
        for event in items:
            if event.get("status") == "cancelled":
                if event.get("id"):
                    await repositories.delete_task_by_google_ids(user_email, calendar_id, event.get("id"))
                continue
            await repositories.upsert_google_task(user_email, calendar_id, event)
        next_token = response.get("nextSyncToken")
        await repositories.update_sync_cursor(user_email, calendar_id, next_token, None)

    # If no background worker is running, drain a small batch of pending outbox items here.
    drained = await process_outbox_once(limit=10)
    return {"ok": True, "outbox_drained": drained}
