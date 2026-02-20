from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from uuid import uuid4

from sqlalchemy import text as sql_text, bindparam

from backend.db import get_sessionmaker
from backend.settings import get_settings

ENTRIES_TABLE = "daily_entries_user"
SETTINGS_TABLE = "settings"
TASKS_TABLE = "todo_tasks"
SUBTASKS_TABLE = "todo_subtasks"
GOOGLE_TOKENS_TABLE = "google_calendar_tokens"
SYNC_OUTBOX_TABLE = "sync_outbox"
SYNC_CURSOR_TABLE = "google_sync_cursor"

HABIT_KEYS = [
    "bible_reading",
    "bible_study",
    "dissertation_work",
    "workout",
    "general_reading",
    "shower",
    "daily_text",
    "meeting_attended",
    "prepare_meeting",
    "family_worship",
    "writing",
    "scientific_writing",
]

ENTRY_SELECT_COLUMNS = [
    "user_email",
    "date",
    *HABIT_KEYS,
    "sleep_hours",
    "anxiety_level",
    "work_hours",
    "boredom_minutes",
    "mood_category",
    "priority_label",
    "priority_done",
    "mood_note",
    "mood_media_url",
    "mood_tags_json",
    "updated_at",
]


def _new_id() -> str:
    return uuid4().hex


def _normalize_time_value(value):
    if value is None:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%H:%M")
    value_str = str(value).strip()
    return value_str[:5] if value_str else None


def _parse_minutes(value):
    if value is None:
        return None
    try:
        minutes = int(value)
    except Exception:
        return None
    return minutes if minutes >= 0 else None


def _normalize_priority(value):
    if value in {"High", "Medium", "Low"}:
        return value
    return "Medium"


def _normalize_task_row(row: dict) -> dict:
    if not row:
        return {}
    payload = dict(row)
    scheduled_date = payload.get("scheduled_date")
    if isinstance(scheduled_date, date):
        payload["scheduled_date"] = scheduled_date.isoformat()
    scheduled_time = payload.get("scheduled_time")
    if scheduled_time is not None and hasattr(scheduled_time, "strftime"):
        payload["scheduled_time"] = scheduled_time.strftime("%H:%M")
    for key in ("created_at", "updated_at"):
        value = payload.get(key)
        if value is not None and hasattr(value, "isoformat"):
            payload[key] = value.isoformat()
    return payload


def get_partner_email(user_email: str) -> str | None:
    settings = get_settings()
    allowed = settings.allowed_emails
    if len(allowed) >= 2:
        a = allowed[0].lower()
        b = allowed[1].lower()
        current = user_email.lower()
        if current == a:
            return allowed[1]
        if current == b:
            return allowed[0]
    return None


def _entry_patch_payload(user_email: str, day_iso: str, patch: dict) -> dict:
    clean_patch = dict(patch)
    clean_patch["updated_at"] = datetime.utcnow().isoformat()
    columns = ["user_email", "date"] + list(clean_patch.keys())
    placeholders = ", ".join([f":{col}" for col in columns])
    updates = ", ".join([f"{col}=EXCLUDED.{col}" for col in clean_patch.keys()])
    return {
        "columns": columns,
        "placeholders": placeholders,
        "updates": updates,
        "payload": {"user_email": user_email, "date": day_iso, **clean_patch},
    }


async def get_day_entry(user_email: str, day_iso: str) -> dict:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        row = (await session.execute(
            sql_text(
                f"SELECT {', '.join(ENTRY_SELECT_COLUMNS)} FROM {ENTRIES_TABLE} "
                "WHERE user_email = :user_email AND date = :date"
            ),
            {"user_email": user_email, "date": day_iso},
        )).mappings().fetchone()
    return dict(row) if row else {}


async def list_entries_range(user_email: str, start_iso: str, end_iso: str) -> list[dict]:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        rows = (await session.execute(
            sql_text(
                f"""
                SELECT {', '.join(ENTRY_SELECT_COLUMNS)}
                FROM {ENTRIES_TABLE}
                WHERE user_email = :user_email
                  AND date BETWEEN :start_date AND :end_date
                ORDER BY date
                """
            ),
            {
                "user_email": user_email,
                "start_date": start_iso,
                "end_date": end_iso,
            },
        )).mappings().all()
    return [dict(row) for row in rows]


async def patch_day_entry(user_email: str, day_iso: str, patch: dict) -> None:
    normalized = dict(patch or {})
    for key, value in list(normalized.items()):
        if isinstance(value, bool):
            normalized[key] = int(value)
    payload_info = _entry_patch_payload(user_email, day_iso, normalized)
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                INSERT INTO {ENTRIES_TABLE} ({', '.join(payload_info['columns'])})
                VALUES ({payload_info['placeholders']})
                ON CONFLICT(user_email, date) DO UPDATE SET {payload_info['updates']}
                """
            ),
            payload_info["payload"],
        )
        await session.commit()


async def get_setting(user_email: str, key: str, scoped: bool = True) -> str | None:
    setting_key = f"{user_email}::{key}" if scoped else key
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        row = (await session.execute(
            sql_text(f"SELECT value FROM {SETTINGS_TABLE} WHERE key = :key"),
            {"key": setting_key},
        )).fetchone()
    return row[0] if row else None


async def set_setting(user_email: str, key: str, value: str, scoped: bool = True) -> None:
    setting_key = f"{user_email}::{key}" if scoped else key
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"INSERT INTO {SETTINGS_TABLE} (key, value) VALUES (:key, :value) "
                "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value"
            ),
            {"key": setting_key, "value": value},
        )
        await session.commit()


async def get_custom_habit_done(user_email: str, day_iso: str) -> dict:
    raw = await get_setting(user_email, f"custom_habit_done::{day_iso}")
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    return {str(k): int(bool(v)) for k, v in payload.items()}


async def set_custom_habit_done(user_email: str, day_iso: str, done_map: dict) -> None:
    clean = {str(k): int(bool(v)) for k, v in (done_map or {}).items()}
    await set_setting(user_email, f"custom_habit_done::{day_iso}", json.dumps(clean, ensure_ascii=False))


async def list_custom_habit_done_range(user_email: str, start_iso: str, end_iso: str) -> dict:
    prefix = f"{user_email}::custom_habit_done::"
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        rows = (await session.execute(
            sql_text(
                f"""
                SELECT key, value
                FROM {SETTINGS_TABLE}
                WHERE key LIKE :prefix
                """
            ),
            {"prefix": f"{prefix}%"},
        )).mappings().all()
    payload = {}
    for row in rows:
        key = str(row.get("key") or "")
        date_part = key.replace(prefix, "", 1)
        if not date_part:
            continue
        if not (start_iso <= date_part <= end_iso):
            continue
        try:
            decoded = json.loads(row.get("value") or "{}")
        except Exception:
            decoded = {}
        if isinstance(decoded, dict):
            payload[date_part] = {str(k): int(bool(v)) for k, v in decoded.items()}
    return payload


async def list_custom_habits(user_email: str) -> list[dict]:
    raw = await get_setting(user_email, "custom_habits")
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except Exception:
        items = []
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict) and item.get("active", True)]


async def save_custom_habits(user_email: str, habits: list[dict]) -> None:
    await set_setting(user_email, "custom_habits", json.dumps(habits, ensure_ascii=False))


async def add_custom_habit(user_email: str, name: str) -> dict:
    name = " ".join(str(name or "").split()).strip()[:60]
    if not name:
        raise ValueError("Habit name cannot be empty")
    existing = await list_custom_habits(user_email)
    if any(item.get("name", "").lower() == name.lower() for item in existing):
        raise ValueError("Habit already exists")
    payload = {"id": _new_id(), "name": name, "active": True}
    full_catalog = existing + [payload]
    await save_custom_habits(user_email, full_catalog)
    return payload


async def update_custom_habit(user_email: str, habit_id: str, name: str) -> None:
    name = " ".join(str(name or "").split()).strip()[:60]
    if not name:
        raise ValueError("Habit name cannot be empty")
    catalog = await list_custom_habits(user_email)
    updated = False
    for item in catalog:
        if item.get("id") == habit_id:
            item["name"] = name
            updated = True
            break
    if not updated:
        raise ValueError("Habit not found")
    await save_custom_habits(user_email, catalog)


async def delete_custom_habit(user_email: str, habit_id: str) -> None:
    catalog = await list_custom_habits(user_email)
    updated = False
    for item in catalog:
        if item.get("id") == habit_id:
            item["active"] = False
            updated = True
    if updated:
        await save_custom_habits(user_email, catalog)


async def get_meeting_days(user_email: str) -> list[int]:
    raw = await get_setting(user_email, "meeting_days")
    if not raw:
        return [1, 3]
    try:
        return [int(item) for item in str(raw).split(",") if str(item).strip() != ""]
    except Exception:
        return [1, 3]


async def set_meeting_days(user_email: str, days: list[int]) -> None:
    clean = [int(day) for day in days if isinstance(day, int) or str(day).isdigit()]
    await set_setting(user_email, "meeting_days", ",".join(map(str, clean)))


async def get_family_worship_day(user_email: str) -> int:
    raw = await get_setting(user_email, "family_worship_day")
    if not raw:
        return 6
    try:
        return int(str(raw).strip())
    except Exception:
        return 6


async def set_family_worship_day(user_email: str, day_index: int) -> None:
    await set_setting(user_email, "family_worship_day", str(int(day_index)))


async def list_tasks(user_email: str, start_iso: str, end_iso: str) -> list[dict]:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        rows = (await session.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done,
                    google_calendar_id, google_event_id, created_at, updated_at
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND scheduled_date BETWEEN :start_date AND :end_date
                ORDER BY scheduled_date, scheduled_time IS NULL, scheduled_time, created_at
                """
            ),
            {"user_email": user_email, "start_date": start_iso, "end_date": end_iso},
        )).mappings().all()
    return [_normalize_task_row(row) for row in rows]


async def count_pending_tasks(user_email: str, day_iso: str) -> int:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        count = (await session.execute(
            sql_text(
                f"""
                SELECT COUNT(*) FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND scheduled_date = :day_iso
                  AND COALESCE(is_done, 0) = 0
                """
            ),
            {"user_email": user_email, "day_iso": day_iso},
        )).scalar_one()
    return int(count or 0)


async def list_unscheduled_tasks(user_email: str, source: str | None = None) -> list[dict]:
    session_factory = get_sessionmaker()
    filter_source = source or "remembered"
    async with session_factory() as session:
        rows = (await session.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done,
                    google_calendar_id, google_event_id, created_at, updated_at
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND scheduled_date IS NULL
                  AND source = :source
                ORDER BY created_at ASC
                """
            ),
            {"user_email": user_email, "source": filter_source},
        )).mappings().all()
    return [_normalize_task_row(row) for row in rows]


async def get_task_by_google_ids(user_email: str, calendar_id: str, event_id: str) -> dict | None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        row = (await session.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done,
                    google_calendar_id, google_event_id, created_at, updated_at
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND google_calendar_id = :calendar_id
                  AND google_event_id = :event_id
                LIMIT 1
                """
            ),
            {"user_email": user_email, "calendar_id": calendar_id, "event_id": event_id},
        )).mappings().fetchone()
    return _normalize_task_row(row) if row else None


async def delete_task_by_google_ids(user_email: str, calendar_id: str, event_id: str) -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                DELETE FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND google_calendar_id = :calendar_id
                  AND google_event_id = :event_id
                """
            ),
            {"user_email": user_email, "calendar_id": calendar_id, "event_id": event_id},
        )
        await session.commit()


async def upsert_google_task(user_email: str, calendar_id: str, event: dict) -> dict | None:
    event_id = event.get("id")
    if not event_id:
        return None
    existing = await get_task_by_google_ids(user_email, calendar_id, event_id)
    title = event.get("summary") or "Google event"
    start = event.get("start") or {}
    scheduled_date = None
    scheduled_time = None
    if start.get("dateTime"):
        try:
            dt = datetime.fromisoformat(str(start["dateTime"]).replace("Z", "+00:00"))
            scheduled_date = dt.date().isoformat()
            scheduled_time = dt.strftime("%H:%M")
        except Exception:
            scheduled_date = str(start.get("dateTime"))[:10]
            scheduled_time = str(start.get("dateTime"))[11:16]
    elif start.get("date"):
        scheduled_date = str(start.get("date"))
        scheduled_time = None

    payload = {
        "title": title,
        "scheduled_date": scheduled_date,
        "scheduled_time": scheduled_time,
        "external_event_key": event.get("iCalUID"),
        "google_calendar_id": calendar_id,
        "google_event_id": event_id,
    }

    if existing:
        await update_task(user_email, existing["id"], payload)
        return await get_task(user_email, existing["id"])

    return await create_task(
        user_email,
        {
            **payload,
            "source": "google",
        },
    )


async def create_task(user_email: str, payload: dict) -> dict:
    task_id = _new_id()
    record = {
        "id": task_id,
        "user_email": user_email,
        "title": payload.get("title") or "Untitled task",
        "source": payload.get("source") or "manual",
        "external_event_key": payload.get("external_event_key"),
        "scheduled_date": payload.get("scheduled_date"),
        "scheduled_time": _normalize_time_value(payload.get("scheduled_time")),
        "priority_tag": _normalize_priority(payload.get("priority_tag")),
        "estimated_minutes": _parse_minutes(payload.get("estimated_minutes")),
        "actual_minutes": _parse_minutes(payload.get("actual_minutes")),
        "is_done": int(bool(payload.get("is_done", 0))),
        "google_calendar_id": payload.get("google_calendar_id"),
        "google_event_id": payload.get("google_event_id"),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                INSERT INTO {TASKS_TABLE}
                (id, user_email, title, source, external_event_key, scheduled_date,
                 scheduled_time, priority_tag, estimated_minutes, actual_minutes, is_done,
                 google_calendar_id, google_event_id, created_at, updated_at)
                VALUES
                (:id, :user_email, :title, :source, :external_event_key, :scheduled_date,
                 :scheduled_time, :priority_tag, :estimated_minutes, :actual_minutes, :is_done,
                 :google_calendar_id, :google_event_id, :created_at, :updated_at)
                """
            ),
            record,
        )
        await session.commit()
    return record


async def update_task(user_email: str, task_id: str, patch: dict) -> dict:
    allowed = {
        "title",
        "scheduled_date",
        "scheduled_time",
        "priority_tag",
        "estimated_minutes",
        "actual_minutes",
        "is_done",
        "google_calendar_id",
        "google_event_id",
        "external_event_key",
    }
    updates = []
    params = {"id": task_id, "user_email": user_email}
    for key, value in patch.items():
        if key not in allowed:
            continue
        updates.append(f"{key} = :{key}")
        if key == "priority_tag":
            params[key] = _normalize_priority(value)
        elif key in {"estimated_minutes", "actual_minutes"}:
            params[key] = _parse_minutes(value)
        elif key == "scheduled_time":
            params[key] = _normalize_time_value(value)
        elif key == "is_done":
            params[key] = int(bool(value))
        elif key == "scheduled_date" and isinstance(value, date):
            params[key] = value.isoformat()
        else:
            params[key] = value
    if not updates:
        return await get_task(user_email, task_id)
    updates.append("updated_at = :updated_at")
    params["updated_at"] = datetime.utcnow().isoformat()
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"UPDATE {TASKS_TABLE} SET {', '.join(updates)} WHERE id = :id AND user_email = :user_email"
            ),
            params,
        )
        await session.commit()
    return await get_task(user_email, task_id)


async def get_task(user_email: str, task_id: str) -> dict:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        row = (await session.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done,
                    google_calendar_id, google_event_id, created_at, updated_at
                FROM {TASKS_TABLE}
                WHERE id = :id AND user_email = :user_email
                """
            ),
            {"id": task_id, "user_email": user_email},
        )).mappings().fetchone()
    return _normalize_task_row(row) if row else {}


async def delete_task(user_email: str, task_id: str) -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(f"DELETE FROM {SUBTASKS_TABLE} WHERE user_email = :user_email AND task_id = :task_id"),
            {"user_email": user_email, "task_id": task_id},
        )
        await session.execute(
            sql_text(f"DELETE FROM {TASKS_TABLE} WHERE user_email = :user_email AND id = :task_id"),
            {"user_email": user_email, "task_id": task_id},
        )
        await session.commit()


async def list_subtasks(task_ids: list[str], user_email: str) -> dict[str, list[dict]]:
    if not task_ids:
        return {}
    session_factory = get_sessionmaker()
    stmt = sql_text(
        f"""
        SELECT id, task_id, user_email, title, priority_tag, estimated_minutes, actual_minutes,
               is_done, created_at, updated_at
        FROM {SUBTASKS_TABLE}
        WHERE user_email = :user_email AND task_id IN :task_ids
        ORDER BY created_at ASC
        """
    ).bindparams(bindparam("task_ids", expanding=True))

    async with session_factory() as session:
        rows = (await session.execute(stmt, {"user_email": user_email, "task_ids": task_ids})).mappings().all()
    payload: dict[str, list[dict]] = {task_id: [] for task_id in task_ids}
    for row in rows:
        row_dict = dict(row)
        payload.setdefault(row_dict["task_id"], []).append(row_dict)
    return payload


async def add_subtask(user_email: str, task_id: str, title: str, priority_tag: str, estimated_minutes: int) -> dict:
    clean_title = (title or "").strip()
    if not clean_title:
        raise ValueError("Subtask title cannot be empty")
    payload = {
        "id": _new_id(),
        "task_id": task_id,
        "user_email": user_email,
        "title": clean_title,
        "priority_tag": _normalize_priority(priority_tag),
        "estimated_minutes": _parse_minutes(estimated_minutes),
        "actual_minutes": None,
        "is_done": 0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                INSERT INTO {SUBTASKS_TABLE}
                (id, task_id, user_email, title, priority_tag, estimated_minutes, actual_minutes, is_done, created_at, updated_at)
                VALUES (:id, :task_id, :user_email, :title, :priority_tag, :estimated_minutes, :actual_minutes, :is_done, :created_at, :updated_at)
                """
            ),
            payload,
        )
        await session.commit()
    return payload


async def update_subtask(user_email: str, subtask_id: str, fields: dict) -> None:
    allowed = {"title", "priority_tag", "estimated_minutes", "actual_minutes", "is_done"}
    updates = []
    params = {"id": subtask_id, "user_email": user_email}
    for key, value in fields.items():
        if key not in allowed:
            continue
        updates.append(f"{key} = :{key}")
        if key == "priority_tag":
            params[key] = _normalize_priority(value)
        elif key in {"estimated_minutes", "actual_minutes"}:
            params[key] = _parse_minutes(value)
        elif key == "is_done":
            params[key] = int(bool(value))
        else:
            params[key] = value
    if not updates:
        return
    updates.append("updated_at = :updated_at")
    params["updated_at"] = datetime.utcnow().isoformat()
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"UPDATE {SUBTASKS_TABLE} SET {', '.join(updates)} WHERE id = :id AND user_email = :user_email"
            ),
            params,
        )
        await session.commit()


async def delete_subtask(user_email: str, subtask_id: str) -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(f"DELETE FROM {SUBTASKS_TABLE} WHERE id = :id AND user_email = :user_email"),
            {"id": subtask_id, "user_email": user_email},
        )
        await session.commit()


async def enqueue_outbox(user_email: str, entity_type: str, entity_id: str, action: str, payload: dict | None = None) -> None:
    session_factory = get_sessionmaker()
    now = datetime.utcnow().isoformat()
    row = {
        "id": _new_id(),
        "user_email": user_email,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "payload_json": json.dumps(payload or {}, ensure_ascii=False, default=str),
        "status": "pending",
        "attempts": 0,
        "next_retry_at": None,
        "last_error": None,
        "created_at": now,
        "updated_at": now,
    }
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                INSERT INTO {SYNC_OUTBOX_TABLE}
                (id, user_email, entity_type, entity_id, action, payload_json, status, attempts, next_retry_at, last_error, created_at, updated_at)
                VALUES (:id, :user_email, :entity_type, :entity_id, :action, :payload_json, :status, :attempts, :next_retry_at, :last_error, :created_at, :updated_at)
                """
            ),
            row,
        )
        await session.commit()


async def list_pending_outbox(limit: int = 25) -> list[dict]:
    session_factory = get_sessionmaker()
    now = datetime.utcnow().isoformat()
    async with session_factory() as session:
        rows = (await session.execute(
            sql_text(
                f"""
                SELECT id, user_email, entity_type, entity_id, action, payload_json,
                       status, attempts, next_retry_at, last_error, created_at, updated_at
                FROM {SYNC_OUTBOX_TABLE}
                WHERE status = 'pending'
                  AND (next_retry_at IS NULL OR next_retry_at <= :now)
                ORDER BY created_at ASC
                LIMIT :limit
                """
            ),
            {"now": now, "limit": limit},
        )).mappings().all()
    return [dict(row) for row in rows]


async def mark_outbox_done(outbox_id: str) -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                UPDATE {SYNC_OUTBOX_TABLE}
                SET status = 'done', updated_at = :updated_at
                WHERE id = :id
                """
            ),
            {"id": outbox_id, "updated_at": datetime.utcnow().isoformat()},
        )
        await session.commit()


async def mark_outbox_error(outbox_id: str, attempts: int, next_retry_at: str, error: str) -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                UPDATE {SYNC_OUTBOX_TABLE}
                SET status = 'pending',
                    attempts = :attempts,
                    next_retry_at = :next_retry_at,
                    last_error = :last_error,
                    updated_at = :updated_at
                WHERE id = :id
                """
            ),
            {
                "id": outbox_id,
                "attempts": attempts,
                "next_retry_at": next_retry_at,
                "last_error": error[:500],
                "updated_at": datetime.utcnow().isoformat(),
            },
        )
        await session.commit()


async def get_google_tokens(user_email: str) -> dict | None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        row = (await session.execute(
            sql_text(
                f"SELECT user_email, refresh_token_enc, access_token, expires_at, scope, updated_at FROM {GOOGLE_TOKENS_TABLE} WHERE user_email = :user_email"
            ),
            {"user_email": user_email},
        )).mappings().fetchone()
    return dict(row) if row else None


async def store_google_tokens(
    user_email: str,
    refresh_token_enc: str,
    access_token: str | None = None,
    expires_at: str | None = None,
    scope: str | None = None,
) -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                INSERT INTO {GOOGLE_TOKENS_TABLE}
                    (user_email, refresh_token_enc, access_token, expires_at, scope, updated_at)
                VALUES
                    (:user_email, :refresh_token_enc, :access_token, :expires_at, :scope, :updated_at)
                ON CONFLICT(user_email) DO UPDATE SET
                    refresh_token_enc = EXCLUDED.refresh_token_enc,
                    access_token = COALESCE(EXCLUDED.access_token, {GOOGLE_TOKENS_TABLE}.access_token),
                    expires_at = COALESCE(EXCLUDED.expires_at, {GOOGLE_TOKENS_TABLE}.expires_at),
                    scope = COALESCE(EXCLUDED.scope, {GOOGLE_TOKENS_TABLE}.scope),
                    updated_at = EXCLUDED.updated_at
                """
            ),
            {
                "user_email": user_email,
                "refresh_token_enc": refresh_token_enc,
                "access_token": access_token,
                "expires_at": expires_at,
                "scope": scope,
                "updated_at": datetime.utcnow().isoformat(),
            },
        )
        await session.commit()


async def update_google_access_token(user_email: str, access_token: str, expires_at: str, scope: str | None = None) -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                UPDATE {GOOGLE_TOKENS_TABLE}
                SET access_token = :access_token,
                    expires_at = :expires_at,
                    scope = COALESCE(:scope, scope),
                    updated_at = :updated_at
                WHERE user_email = :user_email
                """
            ),
            {
                "user_email": user_email,
                "access_token": access_token,
                "expires_at": expires_at,
                "scope": scope,
                "updated_at": datetime.utcnow().isoformat(),
            },
        )
        await session.commit()


async def get_sync_cursor(user_email: str, calendar_id: str) -> dict | None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        row = (await session.execute(
            sql_text(
                f"SELECT user_email, calendar_id, sync_token, last_synced_at, last_error FROM {SYNC_CURSOR_TABLE} WHERE user_email = :user_email AND calendar_id = :calendar_id"
            ),
            {"user_email": user_email, "calendar_id": calendar_id},
        )).mappings().fetchone()
    return dict(row) if row else None


async def update_sync_cursor(user_email: str, calendar_id: str, sync_token: str | None, last_error: str | None) -> None:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        await session.execute(
            sql_text(
                f"""
                INSERT INTO {SYNC_CURSOR_TABLE} (user_email, calendar_id, sync_token, last_synced_at, last_error)
                VALUES (:user_email, :calendar_id, :sync_token, :last_synced_at, :last_error)
                ON CONFLICT(user_email, calendar_id) DO UPDATE SET
                    sync_token = EXCLUDED.sync_token,
                    last_synced_at = EXCLUDED.last_synced_at,
                    last_error = EXCLUDED.last_error
                """
            ),
            {
                "user_email": user_email,
                "calendar_id": calendar_id,
                "sync_token": sync_token,
                "last_synced_at": datetime.utcnow().isoformat(),
                "last_error": last_error,
            },
        )
        await session.commit()


async def get_couple_mood_feed(user_a: str, user_b: str, start_date: date, end_date: date) -> list[dict]:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        rows = (await session.execute(
            sql_text(
                f"""
                SELECT user_email, date, mood_category, mood_note, mood_media_url, mood_tags_json
                FROM {ENTRIES_TABLE}
                WHERE user_email IN (:user_a, :user_b)
                  AND date BETWEEN :start_date AND :end_date
                  AND mood_category IS NOT NULL
                  AND mood_category != ''
                ORDER BY date DESC, user_email ASC
                """
            ),
            {
                "user_a": user_a,
                "user_b": user_b,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        )).mappings().all()
    return [dict(row) for row in rows]


async def get_shared_habit_comparison(today: date, user_a: str, user_b: str, habit_keys: list[str]) -> dict:
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        rows = (await session.execute(
            sql_text(
                f"""
                SELECT user_email, date, {', '.join(habit_keys)}
                FROM {ENTRIES_TABLE}
                WHERE user_email IN (:user_a, :user_b)
                  AND date <= :today
                ORDER BY date DESC
                """
            ),
            {"user_a": user_a, "user_b": user_b, "today": today.isoformat()},
        )).mappings().all()

    by_user = {user_a: {}, user_b: {}}
    for row in rows:
        try:
            row_date = date.fromisoformat(str(row.get("date")))
        except Exception:
            continue
        by_user.setdefault(row["user_email"], {})[row_date] = dict(row)

    async def habit_streak(habit_map, habit_key, valid_weekdays=None, include_today=True):
        count = 0
        current = today if include_today else today - timedelta(days=1)
        while True:
            if valid_weekdays is not None and current.weekday() not in valid_weekdays:
                current = current - timedelta(days=1)
                continue
            row = habit_map.get(current)
            if not row:
                break
            if int(row.get(habit_key, 0) or 0) != 1:
                break
            count += 1
            current = current - timedelta(days=1)
        return count

    habits = []
    meeting_days = {
        user_a: set(await get_meeting_days(user_a)),
        user_b: set(await get_meeting_days(user_b)),
    }
    family_days = {
        user_a: await get_family_worship_day(user_a),
        user_b: await get_family_worship_day(user_b),
    }
    for habit_key in habit_keys:
        valid_a = None
        valid_b = None
        if habit_key in {"meeting_attended", "prepare_meeting"}:
            valid_a = meeting_days[user_a]
            valid_b = meeting_days[user_b]
        elif habit_key == "family_worship":
            valid_a = {family_days[user_a]}
            valid_b = {family_days[user_b]}
        a_today_row = by_user.get(user_a, {}).get(today, {})
        b_today_row = by_user.get(user_b, {}).get(today, {})
        a_today_val = int(a_today_row.get(habit_key, 0) or 0)
        b_today_val = int(b_today_row.get(habit_key, 0) or 0)

        a_expected_today = True
        b_expected_today = True
        if habit_key in {"meeting_attended", "prepare_meeting"}:
            a_expected_today = today.weekday() in meeting_days[user_a]
            b_expected_today = today.weekday() in meeting_days[user_b]
        elif habit_key == "family_worship":
            a_expected_today = today.weekday() == family_days[user_a]
            b_expected_today = today.weekday() == family_days[user_b]

        a_include_today = a_expected_today and a_today_val == 1
        b_include_today = b_expected_today and b_today_val == 1
        a_streak = await habit_streak(by_user.get(user_a, {}), habit_key, valid_a, include_today=a_include_today)
        b_streak = await habit_streak(by_user.get(user_b, {}), habit_key, valid_b, include_today=b_include_today)

        habits.append(
            {
                "habit_key": habit_key,
                "user_a_days": a_streak,
                "user_b_days": b_streak,
                "user_a_today_done": int(a_today_val == 1),
                "user_b_today_done": int(b_today_val == 1),
                "user_a_today_expected": int(bool(a_expected_today)),
                "user_b_today_expected": int(bool(b_expected_today)),
            }
        )

    completed_both = 0
    completed_any = 0
    considered = 0
    today_a = by_user.get(user_a, {}).get(today, {})
    today_b = by_user.get(user_b, {}).get(today, {})
    user_a_meeting_today = today.weekday() in meeting_days[user_a]
    user_b_meeting_today = today.weekday() in meeting_days[user_b]
    user_a_family_today = today.weekday() == family_days[user_a]
    user_b_family_today = today.weekday() == family_days[user_b]
    for habit_key in habit_keys:
        if habit_key in {"meeting_attended", "prepare_meeting"}:
            expected_a = user_a_meeting_today
            expected_b = user_b_meeting_today
            if not expected_a and not expected_b:
                continue
        elif habit_key == "family_worship":
            expected_a = user_a_family_today
            expected_b = user_b_family_today
            if not expected_a and not expected_b:
                continue
        else:
            expected_a = True
            expected_b = True
        considered += 1
        a_val = int(today_a.get(habit_key, 0) or 0)
        b_val = int(today_b.get(habit_key, 0) or 0)
        if expected_a and expected_b and a_val == 1 and b_val == 1:
            completed_both += 1
        if (expected_a and a_val == 1) or (expected_b and b_val == 1):
            completed_any += 1

    denominator = considered or len(habit_keys) or 1
    summary = (
        f"Today both completed {completed_both}/{denominator} shared habits. "
        f"At least one of you completed {completed_any}/{denominator}."
    )
    if user_a_meeting_today != user_b_meeting_today:
        summary = f"{summary} Meeting-day habits are pending for one partner."
    if user_a_family_today != user_b_family_today:
        summary = f"{summary} Family worship day differs between partners."

    return {"today": today.isoformat(), "habits": habits, "summary": summary}
