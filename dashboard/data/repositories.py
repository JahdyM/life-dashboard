import json
import threading
from datetime import date, datetime, timedelta
from uuid import uuid4

from sqlalchemy import bindparam, text as sql_text

from dashboard.data import api_client

ENTRIES_TABLE = "daily_entries_user"
TASKS_TABLE = "todo_tasks"
SUBTASKS_TABLE = "todo_subtasks"
SETTINGS_TABLE = "settings"
PROMPT_CARDS_TABLE = "partner_prompt_cards"
PROMPT_ANSWERS_TABLE = "partner_prompt_answers"
GOOGLE_TOKENS_TABLE = "google_calendar_tokens"

CUSTOM_HABITS_SETTING_KEY = "custom_habits"

_ENGINE_GETTER = None
_DATABASE_URL_GETTER = None
_CURRENT_USER_GETTER = None
_GOOGLE_DELETE_CALLBACK = None
_INVALIDATE_CALLBACK = None
_SECRET_GETTER = None


def configure(engine_getter, database_url_getter, current_user_getter, invalidate_callback=None, secret_getter=None):
    global _ENGINE_GETTER, _DATABASE_URL_GETTER, _CURRENT_USER_GETTER, _INVALIDATE_CALLBACK, _SECRET_GETTER
    _ENGINE_GETTER = engine_getter
    _DATABASE_URL_GETTER = database_url_getter
    _CURRENT_USER_GETTER = current_user_getter
    _INVALIDATE_CALLBACK = invalidate_callback
    _SECRET_GETTER = secret_getter
    api_client.configure(secret_getter, current_user_getter)


def set_google_delete_callback(callback):
    global _GOOGLE_DELETE_CALLBACK
    _GOOGLE_DELETE_CALLBACK = callback


def api_enabled() -> bool:
    return api_client.is_enabled()


def _engine():
    if _ENGINE_GETTER is None or _DATABASE_URL_GETTER is None:
        raise RuntimeError("repositories not configured")
    return _ENGINE_GETTER(_DATABASE_URL_GETTER())


def _current_user():
    if _CURRENT_USER_GETTER is None:
        raise RuntimeError("repositories not configured")
    return _CURRENT_USER_GETTER()


def _invalidate():
    if _INVALIDATE_CALLBACK is None:
        return
    try:
        _INVALIDATE_CALLBACK()
    except Exception:
        pass


def _fire_and_forget_api(method, path, params=None, json_payload=None):
    def _call():
        try:
            api_client.request(method, path, params=params, json=json_payload, timeout=8)
        except Exception:
            pass
    threading.Thread(target=_call, daemon=True).start()


def _scoped_setting_key(user_email, key):
    return f"{user_email}::{key}"


def _new_id():
    return uuid4().hex


def _normalize_time_value(value):
    if value is None:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%H:%M")
    value_str = str(value).strip()
    return value_str[:5] if value_str else None


def _normalize_priority(priority_tag):
    if priority_tag in {"High", "Medium", "Low"}:
        return priority_tag
    return "Medium"


def _parse_minutes(value):
    if value is None:
        return None
    try:
        minutes = int(value)
    except Exception:
        return None
    return max(0, minutes)


def _minutes_between(start_time, end_time):
    if not start_time or not end_time:
        return None
    try:
        start_dt = datetime.strptime(str(start_time), "%H:%M")
        end_dt = datetime.strptime(str(end_time), "%H:%M")
    except Exception:
        return None
    delta = int((end_dt - start_dt).total_seconds() // 60)
    if delta <= 0:
        return None
    return delta


def _entry_patch_for_date(user_email, day, patch):
    if isinstance(day, str):
        day_iso = day
    else:
        day_iso = day.isoformat()
    clean_patch = {k: v for k, v in patch.items()}
    clean_patch["updated_at"] = datetime.utcnow().isoformat()

    columns = ["user_email", "date"] + list(clean_patch.keys())
    placeholders = ", ".join([f":{col}" for col in columns])
    updates = ", ".join([f"{col}=EXCLUDED.{col}" for col in clean_patch.keys()])

    payload = {
        "user_email": user_email,
        "date": day_iso,
        **clean_patch,
    }

    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {ENTRIES_TABLE} ({', '.join(columns)})
                VALUES ({placeholders})
                ON CONFLICT(user_email, date) DO UPDATE SET {updates}
                """
            ),
            payload,
        )
    _invalidate()


def save_habit_toggle(user_email, day, habit_key, value):
    if api_client.is_enabled():
        day_iso = day if isinstance(day, str) else day.isoformat()
        _fire_and_forget_api(
            "PATCH",
            f"/v1/day/{day_iso}",
            json_payload={habit_key: bool(value)},
        )
        return
    _entry_patch_for_date(user_email, day, {habit_key: int(bool(value))})


def save_entry_fields(user_email, day, fields):
    clean = dict(fields or {})
    for key in [
        "bible_reading",
        "bible_study",
        "dissertation_work",
        "workout",
        "general_reading",
        "shower",
        "meeting_attended",
        "prepare_meeting",
        "writing",
        "scientific_writing",
        "priority_done",
    ]:
        if key in clean:
            clean[key] = int(bool(clean[key]))
    if api_client.is_enabled():
        day_iso = day if isinstance(day, str) else day.isoformat()
        _fire_and_forget_api("PATCH", f"/v1/day/{day_iso}", json_payload=clean)
        return
    _entry_patch_for_date(user_email, day, clean)


def get_day_entry(user_email, day):
    day_iso = day if isinstance(day, str) else day.isoformat()
    if api_client.is_enabled():
        try:
            payload = api_client.request("GET", f"/v1/day/{day_iso}")
            return payload.get("data") or {}
        except Exception:
            return {}
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            sql_text(
                f"SELECT * FROM {ENTRIES_TABLE} WHERE user_email = :user_email AND date = :date"
            ),
            {"user_email": user_email, "date": day_iso},
        ).mappings().fetchone()
    return dict(row) if row else {}


def list_entries_range(user_email, start_day, end_day):
    start_iso = start_day.isoformat() if isinstance(start_day, date) else str(start_day)
    end_iso = end_day.isoformat() if isinstance(end_day, date) else str(end_day)
    if api_client.is_enabled():
        try:
            payload = api_client.request("GET", "/v1/entries", params={"start": start_iso, "end": end_iso})
            return payload.get("items", [])
        except Exception:
            return []
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT *
                FROM {ENTRIES_TABLE}
                WHERE user_email = :user_email
                  AND date BETWEEN :start_date AND :end_date
                ORDER BY date
                """
            ),
            {"user_email": user_email, "start_date": start_iso, "end_date": end_iso},
        ).mappings().all()
    return [dict(row) for row in rows]


def get_setting(user_email, key, scoped=True):
    setting_key = _scoped_setting_key(user_email, key) if scoped else key
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            sql_text(f"SELECT value FROM {SETTINGS_TABLE} WHERE key = :key"),
            {"key": setting_key},
        ).fetchone()
    return row[0] if row else None


def set_setting(user_email, key, value, scoped=True):
    setting_key = _scoped_setting_key(user_email, key) if scoped else key
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"INSERT INTO {SETTINGS_TABLE} (key, value) VALUES (:key, :value) "
                "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value"
            ),
            {"key": setting_key, "value": value},
        )
    _invalidate()


def get_meeting_days(user_email):
    if api_client.is_enabled():
        try:
            payload = api_client.request("GET", "/v1/settings/meeting-days")
            days = payload.get("days", [])
            return [int(day) for day in days if str(day).isdigit() or isinstance(day, int)]
        except Exception:
            return [1, 3]
    raw = get_setting(user_email, "meeting_days")
    if not raw:
        return [1, 3]
    try:
        return [int(item) for item in str(raw).split(",") if str(item).strip() != ""]
    except Exception:
        return [1, 3]


def set_meeting_days(user_email, days):
    clean = [int(day) for day in days if str(day).isdigit() or isinstance(day, int)]
    if api_client.is_enabled():
        try:
            api_client.request("PUT", "/v1/settings/meeting-days", json={"days": clean})
            _invalidate()
            return
        except Exception:
            return
    set_setting(user_email, "meeting_days", ",".join(map(str, clean)))


def get_family_worship_day(user_email):
    if api_client.is_enabled():
        try:
            payload = api_client.request("GET", "/v1/settings/family-worship-day")
            return int(payload.get("day", 6))
        except Exception:
            return 6
    raw = get_setting(user_email, "family_worship_day")
    if not raw:
        return 6
    try:
        return int(str(raw).strip())
    except Exception:
        return 6


def set_family_worship_day(user_email, day_index):
    if api_client.is_enabled():
        try:
            api_client.request("PUT", "/v1/settings/family-worship-day", json={"day": int(day_index)})
            _invalidate()
            return
        except Exception:
            return
    set_setting(user_email, "family_worship_day", str(int(day_index)))


def _sanitize_habit_name(raw_value):
    return " ".join(str(raw_value or "").split()).strip()[:60]


def get_custom_habits(user_email, active_only=True):
    if api_client.is_enabled():
        try:
            payload = api_client.request("GET", "/v1/habits/custom") or {}
            items = payload.get("items", [])
            if active_only:
                return [item for item in items if item.get("active", True)]
            return items
        except Exception:
            return []
    raw = get_setting(user_email, CUSTOM_HABITS_SETTING_KEY)
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except Exception:
        payload = []
    if not isinstance(payload, list):
        payload = []

    normalized = []
    seen = set()
    for item in payload:
        if not isinstance(item, dict):
            continue
        habit_id = _sanitize_habit_name(item.get("id"))
        habit_name = _sanitize_habit_name(item.get("name"))
        if not habit_id or not habit_name or habit_id in seen:
            continue
        seen.add(habit_id)
        normalized.append(
            {
                "id": habit_id,
                "name": habit_name,
                "active": bool(item.get("active", True)),
            }
        )
    if active_only:
        return [item for item in normalized if item.get("active", True)]
    return normalized


def _save_custom_habits(user_email, habits_catalog):
    set_setting(
        user_email,
        CUSTOM_HABITS_SETTING_KEY,
        json.dumps(habits_catalog, ensure_ascii=False),
    )


def add_habit(user_email, label):
    clean_label = _sanitize_habit_name(label)
    if not clean_label:
        raise ValueError("Habit name cannot be empty")
    if api_client.is_enabled():
        return api_client.request("POST", "/v1/habits/custom", json={"name": clean_label})
    catalog = get_custom_habits(user_email, active_only=False)
    for item in catalog:
        if item.get("active", True) and item["name"].lower() == clean_label.lower():
            raise ValueError("Habit already exists")
    payload = {"id": _new_id(), "name": clean_label, "active": True}
    catalog.append(payload)
    _save_custom_habits(user_email, catalog)
    return payload


def save_habit_label_edit(user_email, habit_id, label):
    clean_label = _sanitize_habit_name(label)
    if not clean_label:
        raise ValueError("Habit name cannot be empty")
    if api_client.is_enabled():
        api_client.request("PATCH", f"/v1/habits/custom/{habit_id}", json={"name": clean_label})
        _invalidate()
        return
    catalog = get_custom_habits(user_email, active_only=False)
    for item in catalog:
        if item["id"] == habit_id:
            item["name"] = clean_label
            _save_custom_habits(user_email, catalog)
            return
    raise ValueError("Habit not found")


def delete_habit(user_email, habit_id):
    if api_client.is_enabled():
        api_client.request("DELETE", f"/v1/habits/custom/{habit_id}")
        _invalidate()
        return
    catalog = get_custom_habits(user_email, active_only=False)
    changed = False
    for item in catalog:
        if item["id"] == habit_id:
            item["active"] = False
            changed = True
    if changed:
        _save_custom_habits(user_email, catalog)


def get_custom_habit_done(user_email, day):
    if api_client.is_enabled():
        day_iso = day.isoformat() if isinstance(day, date) else str(day)
        try:
            payload = api_client.request("GET", f"/v1/habits/custom/done/{day_iso}")
            return payload.get("done") or {}
        except Exception:
            return {}
    raw = get_setting(user_email, f"custom_habit_done::{day.isoformat()}")
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    return {str(k): int(bool(v)) for k, v in payload.items()}


def set_custom_habit_done(user_email, day, done_map):
    clean = {str(k): int(bool(v)) for k, v in (done_map or {}).items()}
    day_iso = day.isoformat() if isinstance(day, date) else str(day)
    if api_client.is_enabled():
        _fire_and_forget_api("PUT", f"/v1/habits/custom/done/{day_iso}", json_payload={"done": clean})
        return
    set_setting(user_email, f"custom_habit_done::{day_iso}", json.dumps(clean, ensure_ascii=False))


def list_custom_habit_done_range(user_email, start_day, end_day):
    start_iso = start_day.isoformat() if isinstance(start_day, date) else str(start_day)
    end_iso = end_day.isoformat() if isinstance(end_day, date) else str(end_day)
    if api_client.is_enabled():
        try:
            payload = api_client.request("GET", "/v1/habits/custom/done", params={"start": start_iso, "end": end_iso})
            return payload.get("items", {})
        except Exception:
            return {}
    return {}


def get_daily_text(user_email, day):
    day_iso = day if isinstance(day, str) else day.isoformat()
    return get_setting(user_email, f"daily_text::{day_iso}") or ""


def set_daily_text(user_email, day, value):
    day_iso = day if isinstance(day, str) else day.isoformat()
    set_setting(user_email, f"daily_text::{day_iso}", (value or "").strip())


def save_activity(activity_patch):
    user_email = activity_patch.get("user_email") or _current_user()
    task_id = activity_patch.get("id")

    if api_client.is_enabled():
        payload = dict(activity_patch)
        payload.pop("user_email", None)
        if task_id:
            payload.pop("id", None)
        if "scheduled_date" in payload and isinstance(payload.get("scheduled_date"), date):
            payload["scheduled_date"] = payload["scheduled_date"].isoformat()
        if "scheduled_time" in payload:
            payload["scheduled_time"] = _normalize_time_value(payload.get("scheduled_time"))
        if task_id:
            response = api_client.request("PATCH", f"/v1/tasks/{task_id}", json=payload)
            _invalidate()
            return response
        response = api_client.request("POST", "/v1/tasks", json=payload)
        _invalidate()
        return response

    engine = _engine()

    if task_id:
        updates = []
        params = {"id": task_id, "user_email": user_email}
        allowed = {
            "title",
            "source",
            "external_event_key",
            "scheduled_date",
            "scheduled_time",
            "priority_tag",
            "estimated_minutes",
            "actual_minutes",
            "is_done",
            "google_calendar_id",
            "google_event_id",
        }
        for key, value in activity_patch.items():
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
        if updates:
            with engine.begin() as conn:
                conn.execute(
                    sql_text(
                        f"""
                        UPDATE {TASKS_TABLE}
                        SET {', '.join(updates)}
                        WHERE id = :id AND user_email = :user_email
                        """
                    ),
                    params,
                )
            _invalidate()
            return get_activity_by_id(task_id, user_email)

    payload = {
        "id": _new_id(),
        "user_email": user_email,
        "title": (activity_patch.get("title") or "").strip() or "Untitled task",
        "source": activity_patch.get("source") or "manual",
        "external_event_key": activity_patch.get("external_event_key"),
        "scheduled_date": (
            activity_patch.get("scheduled_date").isoformat()
            if isinstance(activity_patch.get("scheduled_date"), date)
            else activity_patch.get("scheduled_date")
        ),
        "scheduled_time": _normalize_time_value(activity_patch.get("scheduled_time")),
        "priority_tag": _normalize_priority(activity_patch.get("priority_tag")),
        "estimated_minutes": _parse_minutes(activity_patch.get("estimated_minutes")),
        "actual_minutes": _parse_minutes(activity_patch.get("actual_minutes")),
        "is_done": int(bool(activity_patch.get("is_done", 0))),
        "google_calendar_id": activity_patch.get("google_calendar_id"),
        "google_event_id": activity_patch.get("google_event_id"),
        "created_at": datetime.utcnow().isoformat(),
    }
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {TASKS_TABLE}
                (
                    id, user_email, title, source, external_event_key, scheduled_date,
                    scheduled_time, priority_tag, estimated_minutes, actual_minutes,
                    is_done, google_calendar_id, google_event_id, created_at
                )
                VALUES
                (
                    :id, :user_email, :title, :source, :external_event_key, :scheduled_date,
                    :scheduled_time, :priority_tag, :estimated_minutes, :actual_minutes,
                    :is_done, :google_calendar_id, :google_event_id, :created_at
                )
                """
            ),
            payload,
        )
    _invalidate()
    return payload


def get_activity_by_id(task_id, user_email=None):
    target_user = user_email or _current_user()
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done,
                    google_calendar_id, google_event_id, created_at
                FROM {TASKS_TABLE}
                WHERE id = :id AND user_email = :user_email
                """
            ),
            {"id": task_id, "user_email": target_user},
        ).mappings().fetchone()
    return dict(row) if row else None


def list_activities_for_day(user_email, day):
    if api_client.is_enabled():
        try:
            day_iso = day.isoformat() if isinstance(day, date) else str(day)
            payload = api_client.request("GET", "/v1/tasks", params={"start": day_iso, "end": day_iso})
            return payload.get("items", [])
        except Exception:
            return []
    engine = _engine()
    day_iso = day.isoformat() if isinstance(day, date) else str(day)
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done,
                    google_calendar_id, google_event_id, created_at
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email AND scheduled_date = :scheduled_date
                ORDER BY scheduled_time IS NULL, scheduled_time, created_at
                """
            ),
            {"user_email": user_email, "scheduled_date": day_iso},
        ).mappings().all()
    return [dict(row) for row in rows]


def list_activities_for_range(user_email, start_day, end_day):
    if api_client.is_enabled():
        try:
            payload = api_client.request(
                "GET",
                "/v1/tasks",
                params={"start": start_day.isoformat(), "end": end_day.isoformat()},
            )
            return payload.get("items", [])
        except Exception:
            return []
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done,
                    google_calendar_id, google_event_id, created_at
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND scheduled_date BETWEEN :start_date AND :end_date
                ORDER BY scheduled_date, scheduled_time IS NULL, scheduled_time, created_at
                """
            ),
            {
                "user_email": user_email,
                "start_date": start_day.isoformat(),
                "end_date": end_day.isoformat(),
            },
        ).mappings().all()
    return [dict(row) for row in rows]


def list_unscheduled_remembered(user_email):
    if api_client.is_enabled():
        try:
            payload = api_client.request("GET", "/v1/tasks/unscheduled")
            return payload.get("items", [])
        except Exception:
            return []
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done,
                    google_calendar_id, google_event_id, created_at
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND source = 'remembered'
                  AND (scheduled_date IS NULL OR scheduled_date = '')
                ORDER BY created_at DESC
                """
            ),
            {"user_email": user_email},
        ).mappings().all()
    return [dict(row) for row in rows]


def schedule_remembered_task(task_id, day, time_or_none):
    if api_client.is_enabled():
        payload = {
            "scheduled_date": day.isoformat() if isinstance(day, date) else str(day),
            "scheduled_time": _normalize_time_value(time_or_none),
        }
        response = api_client.request("PATCH", f"/v1/tasks/{task_id}/schedule", json=payload)
        _invalidate()
        return response
    payload = {
        "id": task_id,
        "scheduled_date": day.isoformat() if isinstance(day, date) else str(day),
        "scheduled_time": _normalize_time_value(time_or_none),
    }
    return save_activity(payload)


def upsert_google_activity(user_email, event_payload):
    calendar_id = (event_payload or {}).get("calendar_id")
    event_id = (event_payload or {}).get("event_id")
    if not calendar_id or not event_id:
        return None

    engine = _engine()
    with engine.connect() as conn:
        existing = conn.execute(
            sql_text(
                f"""
                SELECT
                    id,
                    title,
                    source,
                    external_event_key,
                    scheduled_date,
                    scheduled_time,
                    estimated_minutes,
                    google_calendar_id,
                    google_event_id
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND google_calendar_id = :calendar_id
                  AND google_event_id = :event_id
                LIMIT 1
                """
            ),
            {
                "user_email": user_email,
                "calendar_id": calendar_id,
                "event_id": event_id,
            },
        ).mappings().fetchone()

    patch = {
        "user_email": user_email,
        "title": event_payload.get("title") or "Google event",
        "source": "calendar_sync",
        "external_event_key": event_payload.get("event_key"),
        "scheduled_date": event_payload.get("start_date"),
        "scheduled_time": event_payload.get("start_time"),
        "estimated_minutes": _minutes_between(event_payload.get("start_time"), event_payload.get("end_time")),
        "priority_tag": "Medium",
        "google_calendar_id": calendar_id,
        "google_event_id": event_id,
    }
    if not existing:
        return save_activity(patch)

    # Idempotent sync: skip write when row already matches Google state.
    if (
        (existing.get("title") or "") == (patch["title"] or "")
        and (existing.get("source") or "") == (patch["source"] or "")
        and (existing.get("external_event_key") or "") == (patch["external_event_key"] or "")
        and (existing.get("scheduled_date") or "") == (patch["scheduled_date"] or "")
        and (existing.get("scheduled_time") or "") == (patch["scheduled_time"] or "")
        and int(existing.get("estimated_minutes") or 0) == int(patch.get("estimated_minutes") or 0)
        and (existing.get("google_calendar_id") or "") == (patch["google_calendar_id"] or "")
        and (existing.get("google_event_id") or "") == (patch["google_event_id"] or "")
    ):
        return dict(existing)

    patch["id"] = existing["id"]
    return save_activity(patch)


def sync_google_events_for_range(user_email, start_date, end_date, calendar_ids):
    from dashboard.services import google_calendar  # local import avoids circular import at module load

    events = google_calendar.list_events_for_range(user_email, start_date, end_date, calendar_ids)
    seen_pairs = set()
    for event in events:
        pair = (event.get("calendar_id"), event.get("event_id"))
        if not all(pair):
            continue
        seen_pairs.add(pair)
        upsert_google_activity(user_email, event)

    # Remove stale auto-synced rows that disappeared from Google in this range.
    engine = _engine()
    deleted_count = 0
    with engine.begin() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT id, google_calendar_id, google_event_id
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND source = 'calendar_sync'
                  AND scheduled_date BETWEEN :start_date AND :end_date
                """
            ),
            {
                "user_email": user_email,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        ).mappings().all()
        for row in rows:
            pair = (row.get("google_calendar_id"), row.get("google_event_id"))
            if pair not in seen_pairs:
                conn.execute(
                    sql_text(
                        f"DELETE FROM {TASKS_TABLE} WHERE id = :task_id AND user_email = :user_email"
                    ),
                    {"task_id": row["id"], "user_email": user_email},
                )
                deleted_count += 1
    if deleted_count > 0:
        _invalidate()
    return events


def delete_activity(activity_id, delete_remote_google=True):
    if api_client.is_enabled():
        api_client.request("DELETE", f"/v1/tasks/{activity_id}")
        _invalidate()
        return
    task_row = get_activity_by_id(activity_id)
    if not task_row:
        return

    if (
        delete_remote_google
        and task_row.get("google_calendar_id")
        and task_row.get("google_event_id")
        and _GOOGLE_DELETE_CALLBACK
    ):
        _GOOGLE_DELETE_CALLBACK(
            _current_user(),
            task_row["google_calendar_id"],
            task_row["google_event_id"],
        )

    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"DELETE FROM {SUBTASKS_TABLE} WHERE user_email = :user_email AND task_id = :task_id"
            ),
            {"user_email": _current_user(), "task_id": activity_id},
        )
        conn.execute(
            sql_text(
                f"DELETE FROM {TASKS_TABLE} WHERE user_email = :user_email AND id = :task_id"
            ),
            {"user_email": _current_user(), "task_id": activity_id},
        )
    _invalidate()


def create_google_event_for_activity(user_email, activity_id, calendar_id):
    from dashboard.services import google_calendar

    activity = get_activity_by_id(activity_id, user_email=user_email)
    if not activity:
        return None

    payload = {
        "summary": activity.get("title") or "Task",
    }
    scheduled_date = activity.get("scheduled_date")
    scheduled_time = activity.get("scheduled_time")
    estimated = _parse_minutes(activity.get("estimated_minutes")) or 30
    if scheduled_time:
        timezone_name = google_calendar.get_event_timezone()
        start_dt = datetime.fromisoformat(f"{scheduled_date}T{scheduled_time}:00")
        end_dt = start_dt + timedelta(minutes=estimated)
        payload["start"] = {"dateTime": start_dt.isoformat(), "timeZone": timezone_name}
        payload["end"] = {"dateTime": end_dt.isoformat(), "timeZone": timezone_name}
    else:
        payload["start"] = {"date": scheduled_date}
        payload["end"] = {"date": (date.fromisoformat(scheduled_date) + timedelta(days=1)).isoformat()}

    event = google_calendar.create_event(user_email, calendar_id, payload)
    save_activity(
        {
            "id": activity_id,
            "google_calendar_id": calendar_id,
            "google_event_id": event.get("id"),
            "external_event_key": f"google::{calendar_id}::{event.get('id')}",
        }
    )
    return event


def update_google_event_for_activity(user_email, activity_id, patch=None):
    from dashboard.services import google_calendar

    activity = get_activity_by_id(activity_id, user_email=user_email)
    if not activity:
        return None
    if not activity.get("google_calendar_id") or not activity.get("google_event_id"):
        return None

    if patch is None:
        scheduled_date = activity.get("scheduled_date")
        scheduled_time = activity.get("scheduled_time")
        estimated = _parse_minutes(activity.get("estimated_minutes")) or 30
        patch = {"summary": activity.get("title") or "Task"}
        if scheduled_time:
            timezone_name = google_calendar.get_event_timezone()
            start_dt = datetime.fromisoformat(f"{scheduled_date}T{scheduled_time}:00")
            end_dt = start_dt + timedelta(minutes=estimated)
            patch["start"] = {"dateTime": start_dt.isoformat(), "timeZone": timezone_name}
            patch["end"] = {"dateTime": end_dt.isoformat(), "timeZone": timezone_name}
        else:
            patch["start"] = {"date": scheduled_date}
            patch["end"] = {"date": (date.fromisoformat(scheduled_date) + timedelta(days=1)).isoformat()}

    return google_calendar.update_event(
        user_email,
        activity["google_calendar_id"],
        activity["google_event_id"],
        patch,
    )


def save_mood_choice(user_email, day, mood):
    _entry_patch_for_date(user_email, day, {"mood_category": mood})


def save_mood_details(user_email, day, note, media_url, tags):
    _entry_patch_for_date(
        user_email,
        day,
        {
            "mood_note": (note or "").strip(),
            "mood_media_url": (media_url or "").strip(),
            "mood_tags_json": json.dumps(tags or [], ensure_ascii=False),
        },
    )


def get_mood_details(user_email, day):
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            sql_text(
                f"""
                SELECT mood_category, mood_note, mood_media_url, mood_tags_json
                FROM {ENTRIES_TABLE}
                WHERE user_email = :user_email AND date = :date
                """
            ),
            {"user_email": user_email, "date": day.isoformat()},
        ).mappings().fetchone()
    if not row:
        return {
            "mood_category": None,
            "mood_note": "",
            "mood_media_url": "",
            "mood_tags": [],
        }
    mood_tags = []
    try:
        mood_tags = json.loads(row.get("mood_tags_json") or "[]")
    except Exception:
        mood_tags = []
    if not isinstance(mood_tags, list):
        mood_tags = []
    return {
        "mood_category": row.get("mood_category"),
        "mood_note": row.get("mood_note") or "",
        "mood_media_url": row.get("mood_media_url") or "",
        "mood_tags": [str(tag).strip() for tag in mood_tags if str(tag).strip()],
    }


def _habit_streak(habit_map, habit_key, today, valid_weekdays=None):
    count = 0
    current = today
    while True:
        if valid_weekdays is not None and current.weekday() not in valid_weekdays:
            current -= timedelta(days=1)
            continue
        row = habit_map.get(current)
        if not row:
            break
        if int(row.get(habit_key, 0) or 0) != 1:
            break
        count += 1
        current -= timedelta(days=1)
    return count


def _meeting_days_for_user(user_email):
    return set(get_meeting_days(user_email))


def _family_worship_day_for_user(user_email):
    return get_family_worship_day(user_email)


def get_shared_habit_comparison(today, user_a, user_b, habit_keys):
    if api_client.is_enabled():
        try:
            return api_client.request("GET", "/v1/couple/streaks")
        except Exception:
            return {"today": today.isoformat(), "habits": [], "summary": "Shared summary unavailable."}
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(
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
        ).mappings().all()

    by_user = {user_a: {}, user_b: {}}
    for row in rows:
        try:
            row_date = date.fromisoformat(str(row.get("date")))
        except Exception:
            continue
        by_user.setdefault(row["user_email"], {})[row_date] = dict(row)

    meeting_days = {
        user_a: _meeting_days_for_user(user_a),
        user_b: _meeting_days_for_user(user_b),
    }
    family_day = {
        user_a: _family_worship_day_for_user(user_a),
        user_b: _family_worship_day_for_user(user_b),
    }

    habits = []
    for habit_key in habit_keys:
        valid_weekdays = None
        if habit_key in {"meeting_attended", "prepare_meeting"}:
            # Keep per-user logic with their own meeting days.
            valid_weekdays = "meeting"
        elif habit_key == "family_worship":
            valid_weekdays = "family"
        a_streak = _habit_streak(
            by_user.get(user_a, {}),
            habit_key,
            today,
            valid_weekdays=meeting_days[user_a]
            if valid_weekdays == "meeting"
            else ({family_day[user_a]} if valid_weekdays == "family" else None),
        )
        b_streak = _habit_streak(
            by_user.get(user_b, {}),
            habit_key,
            today,
            valid_weekdays=meeting_days[user_b]
            if valid_weekdays == "meeting"
            else ({family_day[user_b]} if valid_weekdays == "family" else None),
        )
        habits.append({"habit_key": habit_key, "user_a_days": a_streak, "user_b_days": b_streak})

    completed_both = 0
    completed_any = 0
    considered_habits = 0
    today_a = by_user.get(user_a, {}).get(today, {})
    today_b = by_user.get(user_b, {}).get(today, {})
    user_a_meeting_today = today.weekday() in meeting_days[user_a]
    user_b_meeting_today = today.weekday() in meeting_days[user_b]
    user_a_family_today = today.weekday() == family_day[user_a]
    user_b_family_today = today.weekday() == family_day[user_b]
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

        considered_habits += 1
        a_val = int(today_a.get(habit_key, 0) or 0)
        b_val = int(today_b.get(habit_key, 0) or 0)
        if expected_a and expected_b and a_val == 1 and b_val == 1:
            completed_both += 1
        if (expected_a and a_val == 1) or (expected_b and b_val == 1):
            completed_any += 1

    denominator = considered_habits or len(habit_keys) or 1
    summary = (
        f"Today both completed {completed_both}/{denominator} shared habits. "
        f"At least one of you completed {completed_any}/{denominator}."
    )
    if user_a_meeting_today != user_b_meeting_today:
        summary = f"{summary} Meeting-day habits are pending for one partner."
    if user_a_family_today != user_b_family_today:
        summary = f"{summary} Family worship day differs between partners."

    return {
        "today": today.isoformat(),
        "habits": habits,
        "summary": summary,
    }


def get_couple_mood_feed(user_a, user_b, start_date, end_date):
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(
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
        ).mappings().all()
    return [dict(row) for row in rows]


def _default_prompt_cards():
    return [
        {"title": "How did you feel loved today?", "category": "Connection"},
        {"title": "What is one thing we can improve tomorrow?", "category": "Growth"},
        {"title": "What are you grateful for in our day?", "category": "Gratitude"},
    ]


def list_prompt_cards(couple_key):
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT id, couple_key, title, category, is_active, sort_order, created_by, created_at
                FROM {PROMPT_CARDS_TABLE}
                WHERE couple_key = :couple_key AND is_active = 1
                ORDER BY sort_order ASC, created_at ASC
                """
            ),
            {"couple_key": couple_key},
        ).mappings().all()
    payload = [dict(row) for row in rows]

    if payload:
        return payload

    defaults = _default_prompt_cards()
    with engine.begin() as conn:
        for idx, item in enumerate(defaults):
            conn.execute(
                sql_text(
                    f"""
                    INSERT INTO {PROMPT_CARDS_TABLE}
                    (id, couple_key, title, category, is_active, sort_order, created_by, created_at)
                    VALUES (:id, :couple_key, :title, :category, 1, :sort_order, :created_by, :created_at)
                    """
                ),
                {
                    "id": _new_id(),
                    "couple_key": couple_key,
                    "title": item["title"],
                    "category": item["category"],
                    "sort_order": idx,
                    "created_by": _current_user(),
                    "created_at": datetime.utcnow().isoformat(),
                },
            )
    return list_prompt_cards(couple_key)


def add_prompt_card(couple_key, title, category=""):
    clean_title = (title or "").strip()
    if not clean_title:
        raise ValueError("Prompt title cannot be empty")
    engine = _engine()
    with engine.connect() as conn:
        next_order = conn.execute(
            sql_text(
                f"SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {PROMPT_CARDS_TABLE} WHERE couple_key = :couple_key"
            ),
            {"couple_key": couple_key},
        ).scalar_one()

    payload = {
        "id": _new_id(),
        "couple_key": couple_key,
        "title": clean_title,
        "category": (category or "").strip(),
        "sort_order": int(next_order),
        "created_by": _current_user(),
        "created_at": datetime.utcnow().isoformat(),
    }
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {PROMPT_CARDS_TABLE}
                (id, couple_key, title, category, is_active, sort_order, created_by, created_at)
                VALUES (:id, :couple_key, :title, :category, 1, :sort_order, :created_by, :created_at)
                """
            ),
            payload,
        )
    _invalidate()
    return payload


def remove_prompt_card(couple_key, card_id):
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                UPDATE {PROMPT_CARDS_TABLE}
                SET is_active = 0
                WHERE couple_key = :couple_key AND id = :card_id
                """
            ),
            {"couple_key": couple_key, "card_id": card_id},
        )
    _invalidate()


def save_prompt_answer(card_id, user_email, day, answer, done):
    engine = _engine()
    payload = {
        "id": _new_id(),
        "card_id": card_id,
        "couple_key": None,
        "user_email": user_email,
        "answer_date": day.isoformat() if isinstance(day, date) else str(day),
        "answer_text": (answer or "").strip(),
        "is_completed": int(bool(done)),
        "updated_at": datetime.utcnow().isoformat(),
    }

    with engine.connect() as conn:
        row = conn.execute(
            sql_text(
                f"SELECT couple_key FROM {PROMPT_CARDS_TABLE} WHERE id = :card_id"
            ),
            {"card_id": card_id},
        ).fetchone()
    if not row:
        raise ValueError("Prompt card not found")
    payload["couple_key"] = row[0]

    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {PROMPT_ANSWERS_TABLE}
                (id, card_id, couple_key, user_email, answer_date, answer_text, is_completed, updated_at)
                VALUES (:id, :card_id, :couple_key, :user_email, :answer_date, :answer_text, :is_completed, :updated_at)
                ON CONFLICT(card_id, user_email, answer_date)
                DO UPDATE SET
                    answer_text = EXCLUDED.answer_text,
                    is_completed = EXCLUDED.is_completed,
                    updated_at = EXCLUDED.updated_at
                """
            ),
            payload,
        )
    _invalidate()


def list_prompt_answers_by_date(couple_key, day):
    engine = _engine()
    day_iso = day.isoformat() if isinstance(day, date) else str(day)
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT card_id, user_email, answer_text, is_completed, updated_at
                FROM {PROMPT_ANSWERS_TABLE}
                WHERE couple_key = :couple_key AND answer_date = :answer_date
                """
            ),
            {"couple_key": couple_key, "answer_date": day_iso},
        ).mappings().all()
    return [dict(row) for row in rows]


def store_google_tokens(user_email, refresh_token_enc, access_token=None, expires_at=None, scope=None):
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {GOOGLE_TOKENS_TABLE}
                (user_email, refresh_token_enc, access_token, expires_at, scope, updated_at)
                VALUES (:user_email, :refresh_token_enc, :access_token, :expires_at, :scope, :updated_at)
                ON CONFLICT(user_email)
                DO UPDATE SET
                    refresh_token_enc = EXCLUDED.refresh_token_enc,
                    access_token = EXCLUDED.access_token,
                    expires_at = EXCLUDED.expires_at,
                    scope = EXCLUDED.scope,
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
    _invalidate()


def update_google_access_token(user_email, access_token, expires_at, scope=None):
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
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
    _invalidate()


def get_google_tokens(user_email):
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            sql_text(
                f"""
                SELECT user_email, refresh_token_enc, access_token, expires_at, scope, updated_at
                FROM {GOOGLE_TOKENS_TABLE}
                WHERE user_email = :user_email
                """
            ),
            {"user_email": user_email},
        ).mappings().fetchone()
    return dict(row) if row else None


def list_todo_subtasks(task_ids, user_email=None):
    target_user = user_email or _current_user()
    if not task_ids:
        return {}
    engine = _engine()
    stmt = sql_text(
        f"""
        SELECT id, task_id, user_email, title, priority_tag, estimated_minutes, actual_minutes,
               is_done, created_at
        FROM {SUBTASKS_TABLE}
        WHERE user_email = :user_email AND task_id IN :task_ids
        ORDER BY created_at ASC
        """
    ).bindparams(bindparam("task_ids", expanding=True))

    with engine.connect() as conn:
        rows = conn.execute(
            stmt,
            {
                "user_email": target_user,
                "task_ids": list(task_ids),
            },
        ).mappings().all()
    payload = {task_id: [] for task_id in task_ids}
    for row in rows:
        row_dict = dict(row)
        payload.setdefault(row_dict["task_id"], []).append(row_dict)
    return payload


def add_subtask(task_id, title, priority_tag="Medium", estimated_minutes=15):
    clean_title = (title or "").strip()
    if not clean_title:
        return None
    if api_client.is_enabled():
        payload = {
            "task_id": task_id,
            "title": clean_title,
            "priority_tag": _normalize_priority(priority_tag),
            "estimated_minutes": _parse_minutes(estimated_minutes),
        }
        return api_client.request("POST", "/v1/subtasks", json=payload)
    payload = {
        "id": _new_id(),
        "task_id": task_id,
        "user_email": _current_user(),
        "title": clean_title,
        "priority_tag": _normalize_priority(priority_tag),
        "estimated_minutes": _parse_minutes(estimated_minutes),
        "actual_minutes": None,
        "is_done": 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {SUBTASKS_TABLE}
                (id, task_id, user_email, title, priority_tag, estimated_minutes, actual_minutes, is_done, created_at)
                VALUES (:id, :task_id, :user_email, :title, :priority_tag, :estimated_minutes, :actual_minutes, :is_done, :created_at)
                """
            ),
            payload,
        )
    _invalidate()
    return payload


def update_subtask(subtask_id, fields):
    if api_client.is_enabled():
        payload = {}
        for key in ["title", "priority_tag", "estimated_minutes", "actual_minutes", "is_done"]:
            if key in (fields or {}):
                payload[key] = fields[key]
        if not payload:
            return
        api_client.request("PATCH", f"/v1/subtasks/{subtask_id}", json=payload)
        _invalidate()
        return
    allowed = {"title", "priority_tag", "estimated_minutes", "actual_minutes", "is_done"}
    updates = []
    params = {"id": subtask_id, "user_email": _current_user()}
    for key, value in (fields or {}).items():
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
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                UPDATE {SUBTASKS_TABLE}
                SET {', '.join(updates)}
                WHERE id = :id AND user_email = :user_email
                """
            ),
            params,
        )
    _invalidate()


def delete_subtask(subtask_id):
    if api_client.is_enabled():
        api_client.request("DELETE", f"/v1/subtasks/{subtask_id}")
        _invalidate()
        return
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"DELETE FROM {SUBTASKS_TABLE} WHERE id = :id AND user_email = :user_email"
            ),
            {"id": subtask_id, "user_email": _current_user()},
        )
    _invalidate()
