import json
from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import bindparam, text as sql_text

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


def configure(engine_getter, database_url_getter, current_user_getter, invalidate_callback=None):
    global _ENGINE_GETTER, _DATABASE_URL_GETTER, _CURRENT_USER_GETTER, _INVALIDATE_CALLBACK
    _ENGINE_GETTER = engine_getter
    _DATABASE_URL_GETTER = database_url_getter
    _CURRENT_USER_GETTER = current_user_getter
    _INVALIDATE_CALLBACK = invalidate_callback


def set_google_delete_callback(callback):
    global _GOOGLE_DELETE_CALLBACK
    _GOOGLE_DELETE_CALLBACK = callback


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
    _entry_patch_for_date(user_email, day, clean)


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


def _sanitize_habit_name(raw_value):
    return " ".join(str(raw_value or "").split()).strip()[:60]


def get_custom_habits(user_email, active_only=True):
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
    catalog = get_custom_habits(user_email, active_only=False)
    for item in catalog:
        if item["id"] == habit_id:
            item["name"] = clean_label
            _save_custom_habits(user_email, catalog)
            return
    raise ValueError("Habit not found")


def delete_habit(user_email, habit_id):
    catalog = get_custom_habits(user_email, active_only=False)
    changed = False
    for item in catalog:
        if item["id"] == habit_id:
            item["active"] = False
            changed = True
    if changed:
        _save_custom_habits(user_email, catalog)


def get_custom_habit_done(user_email, day):
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
    set_setting(
        user_email,
        f"custom_habit_done::{day.isoformat()}",
        json.dumps(clean, ensure_ascii=False),
    )


def save_activity(activity_patch):
    user_email = activity_patch.get("user_email") or _current_user()
    task_id = activity_patch.get("id")
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


def delete_activity(activity_id, delete_remote_google=True):
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
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"DELETE FROM {SUBTASKS_TABLE} WHERE id = :id AND user_email = :user_email"
            ),
            {"id": subtask_id, "user_email": _current_user()},
        )
    _invalidate()
