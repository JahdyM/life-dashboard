from __future__ import annotations

from sqlalchemy import text as sql_text

from backend.db import get_engine


ENTRIES_TABLE = "daily_entries_user"
TASKS_TABLE = "todo_tasks"
SUBTASKS_TABLE = "todo_subtasks"
SETTINGS_TABLE = "settings"
GOOGLE_TOKENS_TABLE = "google_calendar_tokens"

SYNC_CURSOR_TABLE = "google_sync_cursor"
SYNC_OUTBOX_TABLE = "sync_outbox"
SHARED_STREAK_CACHE_TABLE = "shared_streak_cache"
DAY_SNAPSHOT_CACHE_TABLE = "day_snapshot_cache"


async def init_db():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {ENTRIES_TABLE} (
                    user_email TEXT NOT NULL,
                    date TEXT NOT NULL,
                    bible_reading INTEGER DEFAULT 0,
                    bible_study INTEGER DEFAULT 0,
                    dissertation_work INTEGER DEFAULT 0,
                    workout INTEGER DEFAULT 0,
                    general_reading INTEGER DEFAULT 0,
                    shower INTEGER DEFAULT 0,
                    meeting_attended INTEGER DEFAULT 0,
                    prepare_meeting INTEGER DEFAULT 0,
                    writing INTEGER DEFAULT 0,
                    scientific_writing INTEGER DEFAULT 0,
                    sleep_hours REAL,
                    anxiety_level INTEGER,
                    work_hours REAL,
                    boredom_minutes INTEGER,
                    mood_category TEXT,
                    priority_label TEXT,
                    priority_done INTEGER DEFAULT 0,
                    mood_note TEXT,
                    mood_media_url TEXT,
                    mood_tags_json TEXT,
                    updated_at TEXT,
                    PRIMARY KEY (user_email, date)
                )
                """
            )
        )
        await conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {SETTINGS_TABLE} (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
                """
            )
        )
        await conn.execute(
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
                    created_at TEXT NOT NULL,
                    updated_at TEXT
                )
                """
            )
        )
        await conn.execute(
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
                    created_at TEXT NOT NULL,
                    updated_at TEXT
                )
                """
            )
        )
        await conn.execute(
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
        await conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {SYNC_CURSOR_TABLE} (
                    user_email TEXT NOT NULL,
                    calendar_id TEXT NOT NULL,
                    sync_token TEXT,
                    last_synced_at TEXT,
                    last_error TEXT,
                    PRIMARY KEY (user_email, calendar_id)
                )
                """
            )
        )
        await conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {SYNC_OUTBOX_TABLE} (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    payload_json TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    attempts INTEGER DEFAULT 0,
                    next_retry_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
        )
        await conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {SHARED_STREAK_CACHE_TABLE} (
                    couple_key TEXT NOT NULL,
                    habit_key TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    streak_days INTEGER DEFAULT 0,
                    updated_at TEXT,
                    PRIMARY KEY (couple_key, habit_key, user_email)
                )
                """
            )
        )
        await conn.execute(
            sql_text(
                f"""
                CREATE TABLE IF NOT EXISTS {DAY_SNAPSHOT_CACHE_TABLE} (
                    user_email TEXT NOT NULL,
                    date TEXT NOT NULL,
                    habits_completed INTEGER DEFAULT 0,
                    habits_total INTEGER DEFAULT 0,
                    habits_percent REAL DEFAULT 0,
                    life_balance_score REAL DEFAULT 0,
                    updated_at TEXT,
                    PRIMARY KEY (user_email, date)
                )
                """
            )
        )

    async def ensure_column(table_name: str, column_name: str, column_ddl: str) -> None:
        try:
            async with engine.begin() as conn:
                await conn.execute(
                    sql_text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_ddl}")
                )
        except Exception:
            return

    async def ensure_index(index_sql: str) -> None:
        try:
            async with engine.begin() as conn:
                await conn.execute(sql_text(index_sql))
        except Exception:
            return

    await ensure_column(TASKS_TABLE, "version", "INTEGER DEFAULT 1")
    await ensure_column(TASKS_TABLE, "updated_at", "TEXT")
    await ensure_column(SUBTASKS_TABLE, "version", "INTEGER DEFAULT 1")
    await ensure_column(SUBTASKS_TABLE, "updated_at", "TEXT")

    await ensure_index(
        f"CREATE INDEX IF NOT EXISTS idx_{TASKS_TABLE}_user_date_updated "
        f"ON {TASKS_TABLE} (user_email, scheduled_date, updated_at)"
    )
    await ensure_index(
        f"CREATE INDEX IF NOT EXISTS idx_{SYNC_OUTBOX_TABLE}_status "
        f"ON {SYNC_OUTBOX_TABLE} (user_email, status, next_retry_at)"
    )
    await ensure_index(
        f"CREATE INDEX IF NOT EXISTS idx_{SYNC_CURSOR_TABLE}_user "
        f"ON {SYNC_CURSOR_TABLE} (user_email, calendar_id)"
    )
    await ensure_index(
        f"CREATE INDEX IF NOT EXISTS idx_{TASKS_TABLE}_google_lookup "
        f"ON {TASKS_TABLE} (user_email, google_calendar_id, google_event_id)"
    )
    await ensure_index(
        f"CREATE INDEX IF NOT EXISTS idx_{DAY_SNAPSHOT_CACHE_TABLE}_user_date "
        f"ON {DAY_SNAPSHOT_CACHE_TABLE} (user_email, date)"
    )
