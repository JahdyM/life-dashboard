import os
import json
import time
from datetime import date, datetime, timedelta
from uuid import uuid4

import pandas as pd
import streamlit as st
import streamlit.components.v1 as st_components
from sqlalchemy import bindparam, create_engine, inspect, text as sql_text
from sqlalchemy.exc import SQLAlchemyError

from dashboard.header import render_global_header
from dashboard.router import render_router
from dashboard.data import repositories, api_client
from dashboard.data.loaders import (
    fetch_header_cached,
    fetch_ics_events_for_range,
    load_custom_habit_done_by_date,
    load_custom_habit_done_by_date_cached,
    load_data,
    load_data_for_email,
    load_data_for_email_cached,
    load_today_activities_cached,
    load_shared_snapshot_cached,
    list_todo_tasks_for_window_cached,
    resolve_pinterest_image_url,
    get_aesthetic_image_urls,
)
from dashboard.services import google_calendar
from dashboard import theme
from dashboard.auth import (
    DB_PATH,
    load_local_env,
    bootstrap_local_secrets_from_env,
    get_secret,
    get_database_url,
    using_local_sqlite,
    describe_database_target,
    show_database_connection_error,
    running_on_streamlit_cloud,
    enforce_persistent_storage_on_cloud,
    render_data_persistence_notice,
    enforce_google_login,
    get_current_user_email,
    get_display_name,
    get_partner_email,
    scoped_setting_key,
    get_engine,
)




from dashboard.constants import (
    DAY_LABELS,
    DAY_TO_INDEX,
    JAHDY_EMAIL,
    GUILHERME_EMAIL,
    USER_PROFILES,
    SHARED_USER_EMAILS,
    HABITS,
    MEETING_HABIT_KEYS,
    FAMILY_WORSHIP_HABIT_KEYS,
    FIXED_COUPLE_HABIT_KEYS,
    DEFAULT_HABIT_LABELS,
    CUSTOMIZABLE_HABIT_KEYS,
    CUSTOM_HABITS_SETTING_KEY,
    CUSTOM_HABIT_DONE_PREFIX,
    ENTRY_DATA_COLUMNS,
    ENTRY_COLUMNS,
    ENTRIES_TABLE,
    LEGACY_ENTRIES_TABLE,
    TASKS_TABLE,
    SUBTASKS_TABLE,
    CALENDAR_STATUS_TABLE,
    PROMPT_CARDS_TABLE,
    PROMPT_ANSWERS_TABLE,
    GOOGLE_TOKENS_TABLE,
    MOODS,
    MOOD_COLORS,
    MOOD_TO_INT,
    PRIORITY_TAGS,
    PRIORITY_META,
    PINTEREST_MOOD_LINKS,
)

st.set_page_config(page_title="Personal Life Dashboard", layout="wide")

load_local_env()
bootstrap_local_secrets_from_env()


theme_info = theme.inject_theme_css()
ACTIVE_THEME_NAME = theme_info["name"]
ACTIVE_THEME = theme_info["theme"]
THEME_TOGGLE_ICON = theme_info["toggle_icon"]
THEME_TOGGLE_HELP = theme_info["toggle_help"]

st_components.html(
    """
<script>
(function () {
  const parentDoc = (window.parent && window.parent.document) ? window.parent.document : document;
  const parentWin = (window.parent) ? window.parent : window;
  if (parentDoc.getElementById('cursor-trail-container')) return;

  if (!parentDoc.getElementById('cursor-trail-style')) {
    const style = parentDoc.createElement('style');
    style.id = 'cursor-trail-style';
    style.textContent = `
      #cursor-trail-container { position: fixed; inset: 0; pointer-events: none; z-index: 9999; }
      .cursor-trail { position: absolute; width: 24px; height: 24px; border-radius: 50%;
        background: rgba(255,255,255,1); box-shadow: 0 0 28px rgba(255,255,255,0.85);
        mix-blend-mode: screen;
        animation: trailFade 0.9s ease-out forwards; }
      @keyframes trailFade { 0% {opacity:.95; transform:scale(1.15);} 100% {opacity:0; transform:scale(.1);} }
    `;
    parentDoc.head.appendChild(style);
  }

  const container = parentDoc.createElement('div');
  container.id = 'cursor-trail-container';
  parentDoc.body.appendChild(container);
  const maxDots = 18;
  let last = 0;

  parentDoc.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - last < 18) return;
    last = now;
    const dot = parentDoc.createElement('span');
    dot.className = 'cursor-trail';
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
    container.appendChild(dot);
    parentWin.setTimeout(() => dot.remove(), 600);
    if (container.children.length > maxDots) {
      container.children[0].remove();
    }
  });
})();
</script>
""",
    height=0,
)


title_cols = st.columns([16, 1])
with title_cols[0]:
    st.markdown("<div class='page-title' style='font-size:22px; font-weight:600;'>Personal Life Dashboard</div>", unsafe_allow_html=True)
with title_cols[1]:
    if st.button(THEME_TOGGLE_ICON, key="toggle_theme_mode", help=THEME_TOGGLE_HELP):
        st.session_state["ui_theme"] = "light" if ACTIVE_THEME_NAME == "dark" else "dark"
        st.rerun()


def init_db():
    engine = get_engine(get_database_url())
    habit_columns = ",\n    ".join([f"{key} INTEGER DEFAULT 0" for key, _ in HABITS])
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {ENTRIES_TABLE} (
                    user_email TEXT NOT NULL,
                    date TEXT NOT NULL,
                    {habit_columns},
                    sleep_hours REAL,
                    anxiety_level INTEGER,
                    work_hours REAL,
                    boredom_minutes INTEGER,
                    mood_category TEXT,
                    mood_note TEXT,
                    mood_media_url TEXT,
                    mood_tags_json TEXT,
                    priority_label TEXT,
                    priority_done INTEGER DEFAULT 0,
                    updated_at TEXT,
                    PRIMARY KEY (user_email, date)
                )
                """
            )
        )
        conn.execute(
            sql_text(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
                """
            )
        )
        conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {TASKS_TABLE} (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL,
                    external_event_key TEXT,
                    scheduled_date TEXT,
                    scheduled_time TEXT,
                    priority_tag TEXT DEFAULT 'Medium',
                    estimated_minutes INTEGER,
                    actual_minutes INTEGER,
                    is_done INTEGER DEFAULT 0,
                    google_calendar_id TEXT,
                    google_event_id TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {SUBTASKS_TABLE} (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    title TEXT NOT NULL,
                    priority_tag TEXT DEFAULT 'Medium',
                    estimated_minutes INTEGER,
                    actual_minutes INTEGER,
                    is_done INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {CALENDAR_STATUS_TABLE} (
                    user_email TEXT NOT NULL,
                    event_key TEXT NOT NULL,
                    event_date TEXT NOT NULL,
                    is_done INTEGER DEFAULT 0,
                    is_hidden INTEGER DEFAULT 0,
                    PRIMARY KEY (user_email, event_key, event_date)
                )
                """
            )
        )
        conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {PROMPT_CARDS_TABLE} (
                    id TEXT PRIMARY KEY,
                    couple_key TEXT NOT NULL,
                    title TEXT NOT NULL,
                    category TEXT,
                    is_active INTEGER DEFAULT 1,
                    sort_order INTEGER DEFAULT 0,
                    created_by TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {PROMPT_ANSWERS_TABLE} (
                    id TEXT PRIMARY KEY,
                    card_id TEXT NOT NULL,
                    couple_key TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    answer_date TEXT NOT NULL,
                    answer_text TEXT,
                    is_completed INTEGER DEFAULT 0,
                    updated_at TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {GOOGLE_TOKENS_TABLE} (
                    user_email TEXT PRIMARY KEY,
                    refresh_token_enc TEXT NOT NULL,
                    access_token TEXT,
                    expires_at TEXT,
                    scope TEXT,
                    updated_at TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            sql_text(
                f"CREATE INDEX IF NOT EXISTS idx_{TASKS_TABLE}_user_scheduled "
                f"ON {TASKS_TABLE} (user_email, scheduled_date)"
            )
        )
        conn.execute(
            sql_text(
                f"CREATE INDEX IF NOT EXISTS idx_{TASKS_TABLE}_user_source_scheduled "
                f"ON {TASKS_TABLE} (user_email, source, scheduled_date)"
            )
        )
        conn.execute(
            sql_text(
                f"CREATE INDEX IF NOT EXISTS idx_{SUBTASKS_TABLE}_user_task "
                f"ON {SUBTASKS_TABLE} (user_email, task_id)"
            )
        )
        conn.execute(
            sql_text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{PROMPT_ANSWERS_TABLE}_uniq_card_user_day "
                f"ON {PROMPT_ANSWERS_TABLE} (card_id, user_email, answer_date)"
            )
        )
        conn.execute(
            sql_text(
                f"CREATE INDEX IF NOT EXISTS idx_{PROMPT_ANSWERS_TABLE}_couple_day "
                f"ON {PROMPT_ANSWERS_TABLE} (couple_key, answer_date)"
            )
        )

    def ensure_column(table_name, column_name, column_ddl):
        try:
            with engine.begin() as conn:
                conn.execute(
                    sql_text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_ddl}")
                )
        except Exception:
            pass

    def ensure_index(index_sql):
        try:
            with engine.begin() as conn:
                conn.execute(sql_text(index_sql))
        except Exception:
            pass

    ensure_column(TASKS_TABLE, "priority_tag", "TEXT DEFAULT 'Medium'")
    ensure_column(TASKS_TABLE, "estimated_minutes", "INTEGER")
    ensure_column(TASKS_TABLE, "actual_minutes", "INTEGER")
    ensure_column(TASKS_TABLE, "external_event_key", "TEXT")
    ensure_column(TASKS_TABLE, "google_calendar_id", "TEXT")
    ensure_column(TASKS_TABLE, "google_event_id", "TEXT")
    ensure_column(SUBTASKS_TABLE, "priority_tag", "TEXT DEFAULT 'Medium'")
    ensure_column(SUBTASKS_TABLE, "estimated_minutes", "INTEGER")
    ensure_column(SUBTASKS_TABLE, "actual_minutes", "INTEGER")
    ensure_column(CALENDAR_STATUS_TABLE, "is_hidden", "INTEGER DEFAULT 0")
    ensure_column(ENTRIES_TABLE, "mood_note", "TEXT")
    ensure_column(ENTRIES_TABLE, "mood_media_url", "TEXT")
    ensure_column(ENTRIES_TABLE, "mood_tags_json", "TEXT")
    ensure_column(ENTRIES_TABLE, "updated_at", "TEXT")
    for habit_key, _ in HABITS:
        ensure_column(ENTRIES_TABLE, habit_key, "INTEGER DEFAULT 0")
    ensure_index(
        f"CREATE INDEX IF NOT EXISTS idx_{TASKS_TABLE}_user_external_date "
        f"ON {TASKS_TABLE} (user_email, external_event_key, scheduled_date)"
    )
    ensure_index(
        f"CREATE INDEX IF NOT EXISTS idx_{TASKS_TABLE}_user_google_event "
        f"ON {TASKS_TABLE} (user_email, google_calendar_id, google_event_id)"
    )

    # Migrate legacy data (date-based table) to user-scoped table once.
    inspector = inspect(engine)
    if not inspector.has_table(LEGACY_ENTRIES_TABLE):
        return
    legacy_columns = {col["name"] for col in inspector.get_columns(LEGACY_ENTRIES_TABLE)}
    if "date" not in legacy_columns:
        return
    with engine.connect() as conn:
        existing_count = conn.execute(
            sql_text(f"SELECT COUNT(*) FROM {ENTRIES_TABLE}")
        ).scalar_one()
    if existing_count > 0:
        return

    legacy_select_columns = [col for col in ENTRY_COLUMNS if col in legacy_columns]
    owner_email = get_current_user_email()
    select_query = (
        f"SELECT {', '.join(legacy_select_columns)} FROM {LEGACY_ENTRIES_TABLE}"
    )
    with engine.connect() as conn:
        legacy_rows = conn.execute(sql_text(select_query)).mappings().all()
    if not legacy_rows:
        return

    insert_columns = ["user_email"] + ENTRY_COLUMNS
    placeholders = ", ".join([f":{col}" for col in insert_columns])
    updates = ", ".join([f"{col}=EXCLUDED.{col}" for col in ENTRY_DATA_COLUMNS])
    with engine.begin() as conn:
        for row in legacy_rows:
            payload = {
                "user_email": owner_email,
                "date": row.get("date"),
                "sleep_hours": 0,
                "anxiety_level": 1,
                "work_hours": 0,
                "boredom_minutes": 0,
                "mood_category": None,
                "priority_label": "",
                "priority_done": 0,
            }
            for key, _ in HABITS:
                payload[key] = 0
            for col in legacy_select_columns:
                payload[col] = row.get(col)
            if not payload.get("date"):
                continue
            conn.execute(
                sql_text(
                    f"""
                    INSERT INTO {ENTRIES_TABLE} ({', '.join(insert_columns)})
                    VALUES ({placeholders})
                    ON CONFLICT(user_email, date) DO UPDATE SET {updates}
                    """
                ),
                payload,
            )


def migrate_local_sqlite_to_configured_db():
    target_url = get_database_url()
    if using_local_sqlite(target_url):
        return None
    if not os.path.exists(DB_PATH):
        return None
    already_migrated = get_setting("local_sqlite_migrated_at", scoped=False)
    if already_migrated:
        return None

    source_engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    source_inspector = inspect(source_engine)
    target_engine = get_engine(target_url)

    def table_rows(connection, table_name):
        return connection.execute(sql_text(f"SELECT * FROM {table_name}")).mappings().all()

    migrated = {"entries": 0, "tasks": 0, "subtasks": 0, "calendar": 0, "settings": 0}
    try:
        with source_engine.connect() as source_conn, target_engine.begin() as target_conn:
            if source_inspector.has_table(ENTRIES_TABLE):
                for row in table_rows(source_conn, ENTRIES_TABLE):
                    payload = {
                        "user_email": row.get("user_email"),
                        "date": row.get("date"),
                        **{column: row.get(column) for column in ENTRY_DATA_COLUMNS},
                    }
                    if not payload["user_email"] or not payload["date"]:
                        continue
                    target_conn.execute(
                        sql_text(
                            f"""
                            INSERT INTO {ENTRIES_TABLE}
                            (user_email, date, {', '.join(ENTRY_DATA_COLUMNS)})
                            VALUES
                            (:user_email, :date, {', '.join([f":{col}" for col in ENTRY_DATA_COLUMNS])})
                            ON CONFLICT(user_email, date) DO UPDATE SET
                            {', '.join([f"{col}=EXCLUDED.{col}" for col in ENTRY_DATA_COLUMNS])}
                            """
                        ),
                        payload,
                    )
                    migrated["entries"] += 1

            if source_inspector.has_table(TASKS_TABLE):
                for row in table_rows(source_conn, TASKS_TABLE):
                    payload = {
                        "id": row.get("id"),
                        "user_email": row.get("user_email"),
                        "title": row.get("title"),
                        "source": row.get("source") or "manual",
                        "external_event_key": row.get("external_event_key"),
                        "scheduled_date": row.get("scheduled_date"),
                        "scheduled_time": row.get("scheduled_time"),
                        "priority_tag": row.get("priority_tag") or "Medium",
                        "estimated_minutes": row.get("estimated_minutes"),
                        "actual_minutes": row.get("actual_minutes"),
                        "is_done": row.get("is_done") or 0,
                        "google_calendar_id": row.get("google_calendar_id"),
                        "google_event_id": row.get("google_event_id"),
                        "created_at": row.get("created_at") or datetime.utcnow().isoformat(),
                    }
                    if not payload["id"] or not payload["user_email"] or not payload["title"]:
                        continue
                    target_conn.execute(
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
                            ON CONFLICT(id) DO UPDATE SET
                                user_email=EXCLUDED.user_email,
                                title=EXCLUDED.title,
                                source=EXCLUDED.source,
                                external_event_key=EXCLUDED.external_event_key,
                                scheduled_date=EXCLUDED.scheduled_date,
                                scheduled_time=EXCLUDED.scheduled_time,
                                priority_tag=EXCLUDED.priority_tag,
                                estimated_minutes=EXCLUDED.estimated_minutes,
                                actual_minutes=EXCLUDED.actual_minutes,
                                is_done=EXCLUDED.is_done,
                                google_calendar_id=EXCLUDED.google_calendar_id,
                                google_event_id=EXCLUDED.google_event_id
                            """
                        ),
                        payload,
                    )
                    migrated["tasks"] += 1

            if source_inspector.has_table(SUBTASKS_TABLE):
                for row in table_rows(source_conn, SUBTASKS_TABLE):
                    payload = {
                        "id": row.get("id"),
                        "task_id": row.get("task_id"),
                        "user_email": row.get("user_email"),
                        "title": row.get("title"),
                        "priority_tag": row.get("priority_tag") or "Medium",
                        "estimated_minutes": row.get("estimated_minutes"),
                        "actual_minutes": row.get("actual_minutes"),
                        "is_done": row.get("is_done") or 0,
                        "created_at": row.get("created_at") or datetime.utcnow().isoformat(),
                    }
                    if not payload["id"] or not payload["task_id"] or not payload["user_email"] or not payload["title"]:
                        continue
                    target_conn.execute(
                        sql_text(
                            f"""
                            INSERT INTO {SUBTASKS_TABLE}
                            (
                                id, task_id, user_email, title, priority_tag, estimated_minutes,
                                actual_minutes, is_done, created_at
                            )
                            VALUES
                            (
                                :id, :task_id, :user_email, :title, :priority_tag, :estimated_minutes,
                                :actual_minutes, :is_done, :created_at
                            )
                            ON CONFLICT(id) DO UPDATE SET
                                task_id=EXCLUDED.task_id,
                                user_email=EXCLUDED.user_email,
                                title=EXCLUDED.title,
                                priority_tag=EXCLUDED.priority_tag,
                                estimated_minutes=EXCLUDED.estimated_minutes,
                                actual_minutes=EXCLUDED.actual_minutes,
                                is_done=EXCLUDED.is_done
                            """
                        ),
                        payload,
                    )
                    migrated["subtasks"] += 1

            if source_inspector.has_table(CALENDAR_STATUS_TABLE):
                for row in table_rows(source_conn, CALENDAR_STATUS_TABLE):
                    payload = {
                        "user_email": row.get("user_email"),
                        "event_key": row.get("event_key"),
                        "event_date": row.get("event_date"),
                        "is_done": row.get("is_done") or 0,
                        "is_hidden": row.get("is_hidden") or 0,
                    }
                    if not payload["user_email"] or not payload["event_key"] or not payload["event_date"]:
                        continue
                    target_conn.execute(
                        sql_text(
                            f"""
                            INSERT INTO {CALENDAR_STATUS_TABLE}
                            (user_email, event_key, event_date, is_done, is_hidden)
                            VALUES (:user_email, :event_key, :event_date, :is_done, :is_hidden)
                            ON CONFLICT(user_email, event_key, event_date) DO UPDATE SET
                                is_done=EXCLUDED.is_done,
                                is_hidden=EXCLUDED.is_hidden
                            """
                        ),
                        payload,
                    )
                    migrated["calendar"] += 1

            if source_inspector.has_table("settings"):
                for row in table_rows(source_conn, "settings"):
                    payload = dict(row)
                    target_conn.execute(
                        sql_text(
                            """
                            INSERT INTO settings (key, value)
                            VALUES (:key, :value)
                            ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value
                            """
                        ),
                        payload,
                    )
                    migrated["settings"] += 1
    except Exception:
        return "Persistent DB configured, but local migration failed. Existing cloud data is still safe."

    set_setting("local_sqlite_migrated_at", datetime.utcnow().isoformat(), scoped=False)
    copied_total = sum(migrated.values())
    if copied_total == 0:
        return "Persistent DB configured."
    return f"Persistent DB configured. Migrated {copied_total} local record(s) to cloud database."


def upsert_entry(payload):
    engine = get_engine(get_database_url())
    columns = ["user_email"] + ENTRY_COLUMNS
    placeholders = ", ".join([f":{col}" for col in columns])
    updates = ", ".join([f"{col}=EXCLUDED.{col}" for col in ENTRY_DATA_COLUMNS])
    values = {
        "user_email": get_current_user_email(),
        **{col: payload.get(col) for col in ENTRY_COLUMNS},
    }
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {ENTRIES_TABLE} ({', '.join(columns)})
                VALUES ({placeholders})
                ON CONFLICT(user_email, date) DO UPDATE SET {updates}
                """
            ),
            values,
        )
    invalidate_entries_cache()
    invalidate_header_cache()


def delete_entries(start_date, end_date=None):
    engine = get_engine(get_database_url())
    user_email = get_current_user_email()
    with engine.begin() as conn:
        if end_date is None:
            cursor = conn.execute(
                sql_text(
                    f"DELETE FROM {ENTRIES_TABLE} "
                    "WHERE user_email = :user_email AND date = :start"
                ),
                {"user_email": user_email, "start": start_date.isoformat()},
            )
        else:
            cursor = conn.execute(
                sql_text(
                    f"DELETE FROM {ENTRIES_TABLE} "
                    "WHERE user_email = :user_email AND date BETWEEN :start AND :end"
                ),
                {
                    "user_email": user_email,
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                },
            )
    invalidate_entries_cache()
    invalidate_header_cache()
    return cursor.rowcount if cursor.rowcount is not None else 0


def get_setting(key, scoped=True):
    setting_key = scoped_setting_key(key) if scoped else key
    engine = get_engine(get_database_url())
    with engine.connect() as conn:
        row = conn.execute(
            sql_text("SELECT value FROM settings WHERE key = :key"),
            {"key": setting_key},
        ).fetchone()
    return row[0] if row else None


def set_setting(key, value, scoped=True):
    setting_key = scoped_setting_key(key) if scoped else key
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                "INSERT INTO settings (key, value) VALUES (:key, :value) "
                "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value"
            ),
            {"key": setting_key, "value": value},
        )
    invalidate_header_cache()


def get_meeting_days():
    if repositories.api_enabled():
        return repositories.get_meeting_days(get_current_user_email())
    raw = get_setting("meeting_days")
    if not raw:
        legacy_raw = get_setting("meeting_days", scoped=False)
        if legacy_raw:
            raw = legacy_raw
            set_setting("meeting_days", raw)
    if not raw:
        default_days = [1, 3]
        set_setting("meeting_days", ",".join(map(str, default_days)))
        return default_days
    try:
        return [int(x) for x in raw.split(",") if x != ""]
    except ValueError:
        return [1, 3]


def get_family_worship_day():
    if repositories.api_enabled():
        return repositories.get_family_worship_day(get_current_user_email())
    raw = get_setting("family_worship_day")
    if not raw:
        legacy_raw = get_setting("family_worship_day", scoped=False)
        if legacy_raw:
            raw = legacy_raw
            set_setting("family_worship_day", raw)
    if not raw:
        default_day = 6
        set_setting("family_worship_day", str(default_day))
        return default_day
    try:
        return int(str(raw).strip())
    except ValueError:
        return 6


def save_meeting_days():
    labels = st.session_state.get("meeting_days_labels", [])
    days = [DAY_TO_INDEX[label] for label in labels]
    st.session_state["meeting_days"] = days
    set_setting("meeting_days", ",".join(map(str, days)))


def sanitize_habit_name(raw_value):
    return " ".join(str(raw_value or "").split()).strip()[:60]


def default_custom_habits():
    return [
        {"id": f"legacy_{key}", "name": DEFAULT_HABIT_LABELS[key], "active": True}
        for key in CUSTOMIZABLE_HABIT_KEYS
    ]


def get_custom_habits(active_only=True):
    if repositories.api_enabled():
        return repositories.get_custom_habits(get_current_user_email(), active_only=active_only)
    raw = get_setting(CUSTOM_HABITS_SETTING_KEY)
    if not raw:
        defaults = default_custom_habits()
        set_setting(CUSTOM_HABITS_SETTING_KEY, json.dumps(defaults, ensure_ascii=False))
        return defaults
    try:
        items = json.loads(raw)
    except Exception:
        items = []
    if not isinstance(items, list):
        items = []
    normalized = []
    seen_ids = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        habit_id = sanitize_habit_name(item.get("id"))
        habit_name = sanitize_habit_name(item.get("name"))
        if not habit_id or not habit_name or habit_id in seen_ids:
            continue
        seen_ids.add(habit_id)
        normalized.append(
            {
                "id": habit_id,
                "name": habit_name,
                "active": bool(item.get("active", True)),
            }
        )
    if not normalized:
        normalized = default_custom_habits()
    if active_only:
        return [item for item in normalized if item.get("active", True)]
    return normalized


def save_custom_habits(catalog):
    set_setting(CUSTOM_HABITS_SETTING_KEY, json.dumps(catalog, ensure_ascii=False))


def add_custom_habit(name):
    clean_name = sanitize_habit_name(name)
    if not clean_name:
        return False, "Habit name cannot be empty."
    catalog = get_custom_habits(active_only=False)
    if any(item["name"].lower() == clean_name.lower() and item.get("active", True) for item in catalog):
        return False, "This habit already exists."
    catalog.append({"id": uuid4().hex, "name": clean_name, "active": True})
    save_custom_habits(catalog)
    return True, ""


def rename_custom_habit(habit_id, new_name):
    clean_name = sanitize_habit_name(new_name)
    if not clean_name:
        return False, "Habit name cannot be empty."
    catalog = get_custom_habits(active_only=False)
    for item in catalog:
        if item["id"] == habit_id:
            item["name"] = clean_name
            save_custom_habits(catalog)
            return True, ""
    return False, "Habit not found."


def remove_custom_habit(habit_id):
    catalog = get_custom_habits(active_only=False)
    updated = False
    for item in catalog:
        if item["id"] == habit_id:
            item["active"] = False
            updated = True
            break
    if updated:
        save_custom_habits(catalog)
    return updated


def get_custom_habit_done_for_date(entry_date):
    if repositories.api_enabled():
        return repositories.get_custom_habit_done(get_current_user_email(), entry_date)
    raw = get_setting(f"{CUSTOM_HABIT_DONE_PREFIX}{entry_date.isoformat()}")
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        str(habit_id): int(bool(value))
        for habit_id, value in payload.items()
        if sanitize_habit_name(habit_id)
    }


def set_custom_habit_done_for_date(entry_date, habit_done_map):
    if repositories.api_enabled():
        repositories.set_custom_habit_done(get_current_user_email(), entry_date, habit_done_map)
        return
    clean_map = {}
    for habit_id, value in (habit_done_map or {}).items():
        clean_id = sanitize_habit_name(habit_id)
        if not clean_id:
            continue
        clean_map[clean_id] = int(bool(value))
    set_setting(
        f"{CUSTOM_HABIT_DONE_PREFIX}{entry_date.isoformat()}",
        json.dumps(clean_map, ensure_ascii=False),
    )


def _default_entries_range(window_days: int = 365):
    end_date = date.today()
    start_date = end_date - timedelta(days=window_days)
    return start_date, end_date


def load_custom_habit_done_by_date():
    start_date, end_date = _default_entries_range()
    return load_custom_habit_done_by_date_cached(
        get_current_user_email(),
        get_database_url(),
        start_date.isoformat(),
        end_date.isoformat(),
        repositories.api_enabled(),
        api_client.api_base_url(),
    )


def load_custom_habits_into_state(entry_date, custom_habits, custom_done_by_date):
    custom_ids = [habit["id"] for habit in custom_habits]
    loaded_key = (
        get_current_user_email(),
        entry_date.isoformat(),
        "|".join(sorted(custom_ids)),
    )
    if st.session_state.get("loaded_custom_entry_key") == loaded_key:
        return
    done_map = custom_done_by_date.get(entry_date, {})
    for habit in custom_habits:
        widget_key = f"input_custom_{safe_widget_key(habit['id'])}"
        st.session_state[widget_key] = bool(done_map.get(habit["id"], 0))
    st.session_state["loaded_custom_entry_key"] = loaded_key


def invalidate_entries_cache():
    load_data_for_email_cached.clear()


def invalidate_habits_cache():
    load_custom_habit_done_by_date_cached.clear()


def invalidate_tasks_cache():
    list_todo_tasks_for_window_cached.clear()
    load_today_activities_cached.clear()


def invalidate_header_cache():
    if repositories.api_enabled():
        fetch_header_cached.clear()
        return
    load_shared_snapshot_cached.clear()


def invalidate_all_caches():
    invalidate_entries_cache()
    invalidate_habits_cache()
    invalidate_tasks_cache()
    invalidate_header_cache()


def new_id():
    return uuid4().hex


def safe_widget_key(raw_value):
    return "".join(ch if ch.isalnum() else "_" for ch in str(raw_value))[:120]


def normalize_time_value(value):
    if value is None:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%H:%M")
    value_str = str(value).strip()
    return value_str[:5] if value_str else None


def normalize_priority_tag(value):
    if value in PRIORITY_TAGS:
        return value
    return "Medium"


def parse_minutes(value):
    if value is None:
        return None
    try:
        minutes = int(value)
    except Exception:
        return None
    return minutes if minutes > 0 else None


def priority_meta(priority_tag):
    tag = normalize_priority_tag(priority_tag)
    meta = PRIORITY_META[tag]
    return tag, meta["weight"], meta["color"]


def format_time_interval(start_time, estimated_minutes):
    start = normalize_time_value(start_time)
    if not start:
        return "No time"
    est_minutes = parse_minutes(estimated_minutes)
    if not est_minutes:
        return start
    try:
        start_dt = datetime.strptime(start, "%H:%M")
        end_dt = start_dt + timedelta(minutes=est_minutes)
    except Exception:
        return start
    return f"{start} - {end_dt.strftime('%H:%M')}"


def add_todo_task(
    title,
    source="manual",
    scheduled_date=None,
    scheduled_time=None,
    priority_tag="Medium",
    estimated_minutes=None,
    external_event_key=None,
):
    clean_title = (title or "").strip()
    if not clean_title:
        return None
    engine = get_engine(get_database_url())
    payload = {
        "id": new_id(),
        "user_email": get_current_user_email(),
        "title": clean_title,
        "source": source,
        "external_event_key": (external_event_key or "").strip() or None,
        "scheduled_date": scheduled_date.isoformat() if scheduled_date else None,
        "scheduled_time": normalize_time_value(scheduled_time),
        "priority_tag": normalize_priority_tag(priority_tag),
        "estimated_minutes": parse_minutes(estimated_minutes),
        "actual_minutes": None,
        "is_done": 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {TASKS_TABLE}
                (
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done, created_at
                )
                VALUES (
                    :id, :user_email, :title, :source, :external_event_key, :scheduled_date, :scheduled_time,
                    :priority_tag, :estimated_minutes, :actual_minutes, :is_done, :created_at
                )
                """
            ),
            payload,
        )
    invalidate_tasks_cache()
    return payload["id"]


def list_todo_tasks(week_start, week_end, selected_date):
    return list_todo_tasks_for_window_cached(
        get_current_user_email(),
        get_database_url(),
        week_start.isoformat(),
        week_end.isoformat(),
        selected_date.isoformat(),
    )


def get_calendar_override_task(event_key, event_date):
    engine = get_engine(get_database_url())
    with engine.connect() as conn:
        row = conn.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done, created_at
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                  AND source = 'calendar_override'
                  AND external_event_key = :event_key
                  AND scheduled_date = :scheduled_date
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {
                "user_email": get_current_user_email(),
                "event_key": event_key,
                "scheduled_date": event_date.isoformat(),
            },
        ).mappings().fetchone()
    return dict(row) if row else None


def _estimate_event_minutes(event):
    start_time = event.get("start_time")
    end_time = event.get("end_time")
    if not start_time or not end_time:
        return 30
    try:
        start_dt = datetime.strptime(start_time, "%H:%M")
        end_dt = datetime.strptime(end_time, "%H:%M")
    except Exception:
        return 30
    duration = int((end_dt - start_dt).total_seconds() // 60)
    if duration <= 0:
        return 30
    return duration


def create_calendar_override_task(event, event_date):
    existing = get_calendar_override_task(event["event_key"], event_date)
    if existing:
        return existing["id"]
    estimated = _estimate_event_minutes(event)
    return add_todo_task(
        event.get("title") or "Calendar task",
        source="calendar_override",
        scheduled_date=event_date,
        scheduled_time=event.get("start_time"),
        priority_tag="Medium",
        estimated_minutes=estimated,
        external_event_key=event["event_key"],
    )


def get_todo_subtasks_map(task_ids):
    if not task_ids:
        return {}
    engine = get_engine(get_database_url())
    stmt = sql_text(
        f"""
        SELECT
            id, task_id, user_email, title, priority_tag, estimated_minutes, actual_minutes,
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
                "user_email": get_current_user_email(),
                "task_ids": list(task_ids),
            },
        ).mappings().all()
    subtasks_map = {task_id: [] for task_id in task_ids}
    for row in rows:
        payload = dict(row)
        subtasks_map.setdefault(payload["task_id"], []).append(payload)
    return subtasks_map


def get_todo_task_subtasks(task_id):
    return get_todo_subtasks_map([task_id]).get(task_id, [])


def set_todo_task_done(task_id, is_done):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                UPDATE {TASKS_TABLE}
                SET is_done = :is_done
                WHERE user_email = :user_email AND id = :task_id
                """
            ),
            {
                "is_done": int(bool(is_done)),
                "user_email": get_current_user_email(),
                "task_id": task_id,
            },
        )
    invalidate_tasks_cache()


def schedule_todo_task(task_id, scheduled_date, scheduled_time):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                UPDATE {TASKS_TABLE}
                SET scheduled_date = :scheduled_date, scheduled_time = :scheduled_time
                WHERE user_email = :user_email AND id = :task_id
                """
            ),
            {
                "scheduled_date": scheduled_date.isoformat() if scheduled_date else None,
                "scheduled_time": normalize_time_value(scheduled_time),
                "user_email": get_current_user_email(),
                "task_id": task_id,
            },
        )
    invalidate_tasks_cache()


def update_todo_task_fields(
    task_id,
    priority_tag=None,
    estimated_minutes=None,
    actual_minutes=None,
):
    updates = []
    params = {"user_email": get_current_user_email(), "task_id": task_id}
    if priority_tag is not None:
        updates.append("priority_tag = :priority_tag")
        params["priority_tag"] = normalize_priority_tag(priority_tag)
    if estimated_minutes is not None:
        updates.append("estimated_minutes = :estimated_minutes")
        params["estimated_minutes"] = parse_minutes(estimated_minutes)
    if actual_minutes is not None:
        updates.append("actual_minutes = :actual_minutes")
        params["actual_minutes"] = parse_minutes(actual_minutes)
    if not updates:
        return
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                UPDATE {TASKS_TABLE}
                SET {', '.join(updates)}
                WHERE user_email = :user_email AND id = :task_id
                """
            ),
            params,
        )
    invalidate_tasks_cache()


def delete_todo_task(task_id):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"DELETE FROM {SUBTASKS_TABLE} WHERE user_email = :user_email AND task_id = :task_id"
            ),
            {"user_email": get_current_user_email(), "task_id": task_id},
        )
        cursor = conn.execute(
            sql_text(
                f"DELETE FROM {TASKS_TABLE} WHERE user_email = :user_email AND id = :task_id"
            ),
            {"user_email": get_current_user_email(), "task_id": task_id},
        )
    invalidate_tasks_cache()
    return cursor.rowcount if cursor.rowcount is not None else 0


def add_todo_subtask(task_id, title, priority_tag="Medium", estimated_minutes=None):
    clean_title = (title or "").strip()
    if not clean_title:
        return None
    engine = get_engine(get_database_url())
    payload = {
        "id": new_id(),
        "task_id": task_id,
        "user_email": get_current_user_email(),
        "title": clean_title,
        "priority_tag": normalize_priority_tag(priority_tag),
        "estimated_minutes": parse_minutes(estimated_minutes),
        "actual_minutes": None,
        "is_done": 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {SUBTASKS_TABLE}
                (
                    id, task_id, user_email, title, priority_tag,
                    estimated_minutes, actual_minutes, is_done, created_at
                )
                VALUES (
                    :id, :task_id, :user_email, :title, :priority_tag,
                    :estimated_minutes, :actual_minutes, :is_done, :created_at
                )
                """
            ),
            payload,
        )
    invalidate_tasks_cache()
    sync_todo_task_done_from_subtasks(task_id)
    return payload["id"]


def set_todo_subtask_done(subtask_id, is_done):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        row = conn.execute(
            sql_text(
                f"""
                SELECT task_id
                FROM {SUBTASKS_TABLE}
                WHERE user_email = :user_email AND id = :subtask_id
                """
            ),
            {"user_email": get_current_user_email(), "subtask_id": subtask_id},
        ).fetchone()
        conn.execute(
            sql_text(
                f"""
                UPDATE {SUBTASKS_TABLE}
                SET is_done = :is_done
                WHERE user_email = :user_email AND id = :subtask_id
                """
            ),
            {
                "is_done": int(bool(is_done)),
                "user_email": get_current_user_email(),
                "subtask_id": subtask_id,
            },
        )
    invalidate_tasks_cache()
    if row:
        sync_todo_task_done_from_subtasks(row[0])


def update_todo_subtask_fields(
    subtask_id,
    priority_tag=None,
    estimated_minutes=None,
    actual_minutes=None,
):
    updates = []
    params = {"user_email": get_current_user_email(), "subtask_id": subtask_id}
    if priority_tag is not None:
        updates.append("priority_tag = :priority_tag")
        params["priority_tag"] = normalize_priority_tag(priority_tag)
    if estimated_minutes is not None:
        updates.append("estimated_minutes = :estimated_minutes")
        params["estimated_minutes"] = parse_minutes(estimated_minutes)
    if actual_minutes is not None:
        updates.append("actual_minutes = :actual_minutes")
        params["actual_minutes"] = parse_minutes(actual_minutes)
    if not updates:
        return
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                UPDATE {SUBTASKS_TABLE}
                SET {', '.join(updates)}
                WHERE user_email = :user_email AND id = :subtask_id
                """
            ),
            params,
        )
    invalidate_tasks_cache()


def delete_todo_subtask(subtask_id):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        row = conn.execute(
            sql_text(
                f"""
                SELECT task_id FROM {SUBTASKS_TABLE}
                WHERE user_email = :user_email AND id = :subtask_id
                """
            ),
            {"user_email": get_current_user_email(), "subtask_id": subtask_id},
        ).fetchone()
        cursor = conn.execute(
            sql_text(
                f"""
                DELETE FROM {SUBTASKS_TABLE}
                WHERE user_email = :user_email AND id = :subtask_id
                """
            ),
            {"user_email": get_current_user_email(), "subtask_id": subtask_id},
        )
    invalidate_tasks_cache()
    if row:
        sync_todo_task_done_from_subtasks(row[0])
    return cursor.rowcount if cursor.rowcount is not None else 0


def sync_todo_task_done_from_subtasks(task_id):
    subtasks = get_todo_task_subtasks(task_id)
    if not subtasks:
        return
    done_count = sum(int(bool(sub.get("is_done", 0))) for sub in subtasks)
    set_todo_task_done(task_id, done_count == len(subtasks))


def get_task_progress(task, subtasks):
    if subtasks:
        done_count = sum(int(bool(sub.get("is_done", 0))) for sub in subtasks)
        return round((done_count / len(subtasks)) * 100, 1)
    return 100.0 if int(task.get("is_done", 0) or 0) == 1 else 0.0



def build_aesthetic_side_html(image_urls, offset=0):
    if not image_urls:
        return ""
    tiles = [image_urls[(offset + idx) % len(image_urls)] for idx in range(4)]
    blocks = []
    for idx, image_url in enumerate(tiles, start=1):
        safe_url = image_url.replace('"', "%22")
        blocks.append(
            (
                f"<div class='aesthetic-side-item aesthetic-side-{idx}'>"
                f"<img src='{safe_url}' loading='lazy' alt='Aesthetic detail' />"
                "</div>"
            )
        )
    return f"<div class='aesthetic-side'>{''.join(blocks)}</div>"


def get_calendar_event_status_map(target_date, event_keys):
    if not event_keys:
        return {}
    placeholders = ", ".join([f":k{i}" for i in range(len(event_keys))])
    params = {
        "user_email": get_current_user_email(),
        "event_date": target_date.isoformat(),
    }
    for idx, event_key in enumerate(event_keys):
        params[f"k{idx}"] = event_key
    engine = get_engine(get_database_url())
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT event_key, is_done, COALESCE(is_hidden, 0) AS is_hidden
                FROM {CALENDAR_STATUS_TABLE}
                WHERE user_email = :user_email
                  AND event_date = :event_date
                  AND event_key IN ({placeholders})
                """
            ),
            params,
        ).fetchall()
    return {
        row[0]: {"is_done": bool(row[1]), "is_hidden": bool(row[2])}
        for row in rows
    }


def get_calendar_event_done_map(target_date, event_keys):
    status_map = get_calendar_event_status_map(target_date, event_keys)
    return {event_key: status.get("is_done", False) for event_key, status in status_map.items()}


def get_calendar_event_hidden_map(target_date, event_keys):
    status_map = get_calendar_event_status_map(target_date, event_keys)
    return {event_key: status.get("is_hidden", False) for event_key, status in status_map.items()}


def set_calendar_event_done(event_key, event_date, is_done):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {CALENDAR_STATUS_TABLE}
                (user_email, event_key, event_date, is_done)
                VALUES (:user_email, :event_key, :event_date, :is_done)
                ON CONFLICT(user_email, event_key, event_date) DO UPDATE SET is_done = EXCLUDED.is_done
                """
            ),
            {
                "user_email": get_current_user_email(),
                "event_key": event_key,
                "event_date": event_date.isoformat(),
                "is_done": int(bool(is_done)),
            },
        )
    invalidate_tasks_cache()


def set_calendar_event_hidden(event_key, event_date, is_hidden):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            sql_text(
                f"""
                INSERT INTO {CALENDAR_STATUS_TABLE}
                (user_email, event_key, event_date, is_hidden)
                VALUES (:user_email, :event_key, :event_date, :is_hidden)
                ON CONFLICT(user_email, event_key, event_date)
                DO UPDATE SET is_hidden = EXCLUDED.is_hidden
                """
            ),
            {
                "user_email": get_current_user_email(),
                "event_key": event_key,
                "event_date": event_date.isoformat(),
                "is_hidden": int(bool(is_hidden)),
            },
        )
    invalidate_tasks_cache()


def compute_auto_priority(selected_day, scheduled_time, source, progress):
    now = datetime.now()
    if selected_day < date.today() and progress < 100:
        return "High", 3, "#D95252"
    if scheduled_time:
        try:
            scheduled_dt = datetime.combine(
                selected_day,
                datetime.strptime(scheduled_time, "%H:%M").time(),
            )
            delta_minutes = (scheduled_dt - now).total_seconds() / 60
            if selected_day == date.today():
                if delta_minutes <= 0:
                    return "High", 3, "#D95252"
                if delta_minutes <= 120:
                    return "High", 3, "#D95252"
                if delta_minutes <= 360:
                    return "Medium", 2, "#D9C979"
        except Exception:
            pass
    if source == "calendar":
        return "Medium", 2, "#D9C979"
    if progress < 50:
        return "Medium", 2, "#D9C979"
    return "Low", 1, "#8FB6D9"


def build_todo_score(items):
    if not items:
        return 0.0
    weighted = 0.0
    total_weight = 0.0
    for item in items:
        total_weight += item["priority_weight"]
        weighted += item["priority_weight"] * (item["progress"] / 100.0)
    if total_weight == 0:
        return 0.0
    return round((weighted / total_weight) * 100, 1)


def build_time_estimation_insight(day_tasks, task_subtasks_map):
    diffs = []
    for task in day_tasks:
        est = parse_minutes(task.get("estimated_minutes"))
        actual = parse_minutes(task.get("actual_minutes"))
        if est is not None and actual is not None:
            diffs.append(actual - est)
        for subtask in task_subtasks_map.get(task["id"], []):
            sub_est = parse_minutes(subtask.get("estimated_minutes"))
            sub_actual = parse_minutes(subtask.get("actual_minutes"))
            if sub_est is not None and sub_actual is not None:
                diffs.append(sub_actual - sub_est)
    if not diffs:
        return "Add estimated and actual times to see your calibration trend."
    avg_diff = int(round(sum(diffs) / len(diffs)))
    if avg_diff > 0:
        return f"You tend to underestimate your time by {avg_diff} minutes."
    if avg_diff < 0:
        return f"You tend to overestimate your time by {abs(avg_diff)} minutes."
    return "Your time estimates are very accurate."


def get_entry_for_date(entry_date, data):
    if data.empty:
        return {}
    row = data[data["date"] == entry_date]
    if row.empty:
        return {}
    return row.iloc[0].to_dict()


def load_entry_into_state(entry_date, entry):
    loaded_key = (get_current_user_email(), entry_date.isoformat())
    if st.session_state.get("loaded_entry_key") == loaded_key:
        return
    for key, _ in HABITS:
        st.session_state[f"input_{key}"] = bool(entry.get(key, 0) or 0)
    st.session_state["input_sleep_hours"] = float(entry.get("sleep_hours", 0) or 0)
    st.session_state["input_anxiety_level"] = int(entry.get("anxiety_level", 1) or 1)
    st.session_state["input_work_hours"] = float(entry.get("work_hours", 0) or 0)
    st.session_state["input_boredom_minutes"] = int(entry.get("boredom_minutes", 0) or 0)
    st.session_state["input_mood_category"] = entry.get("mood_category") or MOODS[0]
    st.session_state["input_priority_label"] = entry.get("priority_label") or ""
    st.session_state["input_priority_done"] = bool(entry.get("priority_done", 0) or 0)
    st.session_state["loaded_entry_key"] = loaded_key


def auto_save():
    selected_date = st.session_state.get("selected_date")
    if not selected_date:
        return
    meeting_days = st.session_state.get("meeting_days", get_meeting_days())
    is_meeting_day = selected_date.weekday() in meeting_days
    payload = {
        "date": selected_date.isoformat(),
        **{k: int(st.session_state.get(f"input_{k}", False)) for k, _ in HABITS},
        "sleep_hours": float(st.session_state.get("input_sleep_hours", 0) or 0),
        "anxiety_level": int(st.session_state.get("input_anxiety_level", 1) or 1),
        "work_hours": float(st.session_state.get("input_work_hours", 0) or 0),
        "boredom_minutes": int(st.session_state.get("input_boredom_minutes", 0) or 0),
        "mood_category": st.session_state.get("input_mood_category", MOODS[0]),
        "priority_label": st.session_state.get("input_priority_label", "").strip(),
        "priority_done": int(st.session_state.get("input_priority_done", False)),
    }
    if not payload["priority_label"]:
        payload["priority_done"] = 0
    if not is_meeting_day:
        payload["meeting_attended"] = 0
        payload["prepare_meeting"] = 0
    upsert_entry(payload)
    custom_habits = get_custom_habits(active_only=True)
    custom_done_map = {}
    for habit in custom_habits:
        widget_key = f"input_custom_{safe_widget_key(habit['id'])}"
        custom_done_map[habit["id"]] = int(bool(st.session_state.get(widget_key, False)))
    set_custom_habit_done_for_date(selected_date, custom_done_map)
    st.session_state["last_saved_at"] = datetime.now().strftime("%H:%M:%S")


def compute_balance_score(row):
    habits_percent = row.get("habits_percent", 0) or 0
    work_hours = row.get("work_hours", 0) or 0
    sleep_hours = row.get("sleep_hours", 0) or 0
    boredom = row.get("boredom_minutes", 60) or 60

    work_score = min(work_hours, 8) / 8 * 100
    sleep_score = min(sleep_hours, 8) / 8 * 100
    if 10 <= boredom <= 40:
        boredom_score = 100
    elif boredom < 10:
        boredom_score = max(0, (boredom / 10) * 100)
    else:
        boredom_score = max(0, ((60 - boredom) / 20) * 100)

    score = (
        habits_percent * 0.35
        + work_score * 0.25
        + sleep_score * 0.25
        + boredom_score * 0.15
    )
    return round(score, 1)


def zero_boredom_streak(data, today):
    if data.empty:
        return 0
    boredom_map = {row["date"]: int(row.get("boredom_minutes", 0)) for _, row in data.iterrows()}
    count = 0
    current = today
    while True:
        if current not in boredom_map:
            break
        if boredom_map[current] != 0:
            break
        count += 1
        current -= timedelta(days=1)
    return count


def compute_habits_metrics(row, meeting_days, family_worship_day, custom_done_by_date, custom_habit_ids):
    total = 0
    completed = 0
    weekday = row["date"].weekday()
    for key, _ in HABITS:
        if key not in FIXED_COUPLE_HABIT_KEYS:
            continue
        if key in MEETING_HABIT_KEYS and weekday not in meeting_days:
            continue
        if key in FAMILY_WORSHIP_HABIT_KEYS and weekday != family_worship_day:
            continue
        total += 1
        completed += int(row.get(key, 0) or 0)

    done_map = custom_done_by_date.get(row["date"], {})
    for habit_id in custom_habit_ids:
        total += 1
        completed += int(bool(done_map.get(habit_id, 0)))

    priority_label = (row.get("priority_label") or "").strip()
    if priority_label:
        total += 1
        completed += int(row.get("priority_done", 0) or 0)
    percent = round((completed / total) * 100, 1) if total > 0 else 0
    return completed, percent, total


enforce_google_login()
repositories.configure(
    get_engine,
    get_database_url,
    get_current_user_email,
    invalidate_callback=invalidate_all_caches,
    secret_getter=get_secret,
)
google_calendar.configure(get_secret)

api_enabled = repositories.api_enabled()
enforce_persistent_storage_on_cloud(api_enabled=api_enabled)
if not api_enabled:
    if not st.session_state.get("_db_bootstrap_done"):
        try:
            init_db()
            st.session_state["_db_bootstrap_message"] = migrate_local_sqlite_to_configured_db()
            st.session_state["_db_bootstrap_done"] = True
        except SQLAlchemyError as exc:
            show_database_connection_error(exc)
        except Exception as exc:
            show_database_connection_error(exc)

storage_migration_message = st.session_state.get("_db_bootstrap_message")

current_user_email = get_current_user_email()
current_user_name = get_display_name(current_user_email)
partner_email = get_partner_email(current_user_email)
partner_name = get_display_name(partner_email) if partner_email else "Partner"

st.markdown(
    f"<div class='small-label' style='margin-bottom:10px;'>Welcome, <strong>{current_user_name}</strong>.</div>",
    unsafe_allow_html=True,
)
render_data_persistence_notice(storage_migration_message)

perf_debug = st.sidebar.toggle("Perf debug", value=bool(os.getenv("PERF_DEBUG")))
perf_marks = {}

def _perf_mark(label, start_ts):
    if not perf_debug:
        return
    perf_marks[label] = round((time.perf_counter() - start_ts) * 1000, 2)

meeting_days = repositories.get_meeting_days(current_user_email) if api_enabled else get_meeting_days()
if "meeting_days" not in st.session_state:
    st.session_state["meeting_days"] = meeting_days
meeting_days = st.session_state["meeting_days"]

family_worship_day = repositories.get_family_worship_day(current_user_email) if api_enabled else get_family_worship_day()
if "family_worship_day" not in st.session_state:
    st.session_state["family_worship_day"] = family_worship_day
family_worship_day = st.session_state["family_worship_day"]

active_tab = st.session_state.get("ui.active_tab", "Daily Habits")
tabs_needing_data = {"Statistics & Charts", "Mood Board"} if api_enabled else {"Daily Habits", "Statistics & Charts", "Mood Board"}
if active_tab in tabs_needing_data:
    if active_tab == "Statistics & Charts":
        range_start, range_end = _default_entries_range(window_days=180)
    elif active_tab == "Mood Board":
        range_start, range_end = _default_entries_range(window_days=400)
    else:
        range_start, range_end = _default_entries_range(window_days=30)
    data = load_data(range_start, range_end)
else:
    data = pd.DataFrame(columns=ENTRY_COLUMNS)

if active_tab == "Statistics & Charts" and not data.empty:
    custom_habits = (
        repositories.get_custom_habits(current_user_email, active_only=True)
        if api_enabled
        else get_custom_habits(active_only=True)
    )
    custom_habit_ids = [habit["id"] for habit in custom_habits]
    custom_done_by_date = load_custom_habit_done_by_date()
    metrics = data.apply(
        lambda row: compute_habits_metrics(
            row,
            meeting_days,
            family_worship_day,
            custom_done_by_date,
            custom_habit_ids,
        ),
        axis=1,
        result_type="expand",
    )
    data["habits_completed"] = metrics[0]
    data["habits_percent"] = metrics[1]
    data["habits_total"] = metrics[2]
    data["life_balance_score"] = data.apply(compute_balance_score, axis=1)
    data["weekday"] = data["date"].apply(lambda d: d.weekday())
    data["is_weekend"] = data["weekday"] >= 5

# --- TAB ROUTER APP ---
repositories.set_google_delete_callback(google_calendar.delete_event)

shared_habit_keys = [
    "bible_reading",
    "meeting_attended",
    "prepare_meeting",
    "workout",
    "shower",
    "daily_text",
    "family_worship",
]
pending_tasks = 0
shared_snapshot = st.session_state.get(
    "header.shared_snapshot",
    {"today": date.today().isoformat(), "habits": [], "summary": "Shared summary unavailable."},
)
pending_tasks = int(st.session_state.get("header.pending_tasks", 0) or 0)
if api_enabled:
    try:
        if st.session_state.pop("header.invalidate", False):
            fetch_header_cached.clear()
        header_payload = fetch_header_cached(
            current_user_email,
            api_client.api_base_url(),
        )
        pending_tasks = int(header_payload.get("pending_tasks", 0) or 0)
        shared_snapshot = header_payload.get("shared_snapshot") or shared_snapshot
        st.session_state["header.pending_tasks"] = pending_tasks
        st.session_state["header.shared_snapshot"] = shared_snapshot
    except Exception:
        pass
else:
    today_activities = load_today_activities_cached(current_user_email, date.today().isoformat())
    pending_tasks = sum(1 for row in today_activities if int(row.get("is_done", 0) or 0) == 0)
    if partner_email:
        try:
            shared_snapshot = load_shared_snapshot_cached(
                date.today().isoformat(),
                current_user_email,
                partner_email,
                tuple(shared_habit_keys),
            )
        except Exception:
            shared_snapshot = {"today": date.today().isoformat(), "habits": [], "summary": "Shared summary unavailable."}

_t0 = time.perf_counter()
render_global_header(
    {
        "shared_snapshot": shared_snapshot,
        "current_user_name": current_user_name,
        "partner_name": partner_name,
        "habit_labels": DEFAULT_HABIT_LABELS,
        "shared_habit_keys": shared_habit_keys,
    }
)
_perf_mark("header_ms", _t0)

context = {
    "current_user_email": current_user_email,
    "current_user_name": current_user_name,
    "partner_email": partner_email,
    "partner_name": partner_name,
    "data": data,
    "meeting_days": meeting_days,
    "family_worship_day": family_worship_day,
    "quick_indicators": {"pending_tasks": pending_tasks},
}

_t1 = time.perf_counter()
render_router(context)
_perf_mark("tab_render_ms", _t1)
if perf_debug and perf_marks:
    with st.sidebar:
        st.markdown("**Perf timings (ms)**")
        for key, value in perf_marks.items():
            st.caption(f"{key}: {value} ms")
st.stop()
