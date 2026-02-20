from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta

import pandas as pd
import requests
import streamlit as st
from sqlalchemy import text as sql_text

from dashboard.constants import (
    CUSTOM_HABIT_DONE_PREFIX,
    ENTRY_COLUMNS,
    ENTRIES_TABLE,
    HABITS,
)
from dashboard.auth import get_database_url, get_engine, get_current_user_email
from dashboard.data import repositories, api_client

try:
    from icalendar import Calendar
except Exception:  # pragma: no cover
    Calendar = None

try:
    import recurring_ical_events
except Exception:  # pragma: no cover
    recurring_ical_events = None


def _sanitize_habit_name(raw_value):
    if raw_value is None:
        return ""
    return re.sub(r"[^a-zA-Z0-9_-]", "", str(raw_value)).strip()


def _normalize_event_component(component):
    start_raw = component.get("dtstart")
    if not start_raw:
        return None
    end_raw = component.get("dtend")
    title = str(component.get("summary") or "Untitled event")
    uid = str(component.get("uid") or "")
    recurrence_raw = component.get("recurrence-id")

    start_value = start_raw.dt
    end_value = end_raw.dt if end_raw else None
    is_all_day = isinstance(start_value, date) and not isinstance(start_value, datetime)
    if is_all_day:
        start_dt = datetime.combine(start_value, datetime.min.time())
        if end_value is None:
            end_dt = start_dt + timedelta(days=1)
        elif isinstance(end_value, datetime):
            end_dt = end_value
        else:
            end_dt = datetime.combine(end_value, datetime.min.time())
        end_date = end_dt.date()
        if end_date > start_dt.date():
            end_date = end_date - timedelta(days=1)
    else:
        start_dt = (
            start_value
            if isinstance(start_value, datetime)
            else datetime.combine(start_value, datetime.min.time())
        )
        if end_value is None:
            end_dt = start_dt + timedelta(hours=1)
        elif isinstance(end_value, datetime):
            end_dt = end_value
        else:
            end_dt = datetime.combine(end_value, datetime.min.time())
        end_date = end_dt.date()

    if recurrence_raw is not None:
        recurrence_value = recurrence_raw.dt
        if isinstance(recurrence_value, datetime):
            occurrence_key = recurrence_value.isoformat()
        else:
            occurrence_key = datetime.combine(recurrence_value, datetime.min.time()).isoformat()
    else:
        occurrence_key = start_dt.isoformat()

    event_key = f"{uid or title}|{occurrence_key}"
    return {
        "event_key": event_key,
        "title": title,
        "start_date": start_dt.date().isoformat(),
        "end_date": end_date.isoformat(),
        "start_time": None if is_all_day else start_dt.strftime("%H:%M"),
        "end_time": None if is_all_day else end_dt.strftime("%H:%M"),
        "is_all_day": is_all_day,
    }


@st.cache_data(ttl=300, show_spinner=False)
def fetch_ics_events_for_range(ics_url, start_date, end_date):
    if not ics_url:
        return [], None
    if Calendar is None:
        return [], "iCalendar parser unavailable. Add 'icalendar' to requirements."
    if end_date < start_date:
        return [], "Invalid calendar range."
    try:
        response = requests.get(ics_url, timeout=10)
        response.raise_for_status()
        calendar_obj = Calendar.from_ical(response.content)
    except Exception as exc:
        return [], f"Unable to load calendar feed: {exc}"

    components = []
    if recurring_ical_events is not None:
        try:
            components = list(
                recurring_ical_events.of(calendar_obj).between(
                    start_date,
                    end_date + timedelta(days=1),
                )
            )
        except Exception:
            components = []

    if not components:
        return [], None

    events = []
    for component in components:
        payload = _normalize_event_component(component)
        if payload:
            events.append(payload)
    return events, None


@st.cache_data(ttl=120, show_spinner=False)
def load_custom_habit_done_by_date_cached(user_email, database_url, start_iso, end_iso, api_enabled, api_base):
    if api_enabled:
        try:
            payload = api_client.request(
                "GET",
                "/v1/habits/custom/done",
                params={"start": start_iso, "end": end_iso},
            )
            raw_items = payload.get("items", {})
            done_by_date = {}
            for day_iso, parsed in (raw_items or {}).items():
                try:
                    day = date.fromisoformat(day_iso)
                except Exception:
                    continue
                if not isinstance(parsed, dict):
                    continue
                done_by_date[day] = {
                    str(habit_id): int(bool(value))
                    for habit_id, value in parsed.items()
                    if _sanitize_habit_name(habit_id)
                }
            return done_by_date
        except Exception:
            return {}

    engine = get_engine(database_url)
    key_prefix = f"{user_email}::{CUSTOM_HABIT_DONE_PREFIX}"
    like_expr = f"{key_prefix}%"
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text("SELECT key, value FROM settings WHERE key LIKE :key_like"),
            {"key_like": like_expr},
        ).fetchall()
    done_by_date = {}
    for row in rows:
        full_key, raw_value = row[0], row[1]
        if not full_key:
            continue
        date_part = str(full_key).split(CUSTOM_HABIT_DONE_PREFIX, 1)[-1]
        if not (start_iso <= date_part <= end_iso):
            continue
        try:
            day = date.fromisoformat(date_part)
        except Exception:
            continue
        try:
            parsed = json.loads(raw_value or "{}")
        except Exception:
            parsed = {}
        if not isinstance(parsed, dict):
            parsed = {}
        done_by_date[day] = {
            str(habit_id): int(bool(value))
            for habit_id, value in parsed.items()
            if _sanitize_habit_name(habit_id)
        }
    return done_by_date


def load_custom_habit_done_by_date(start_date, end_date):
    return load_custom_habit_done_by_date_cached(
        get_current_user_email(),
        get_database_url(),
        start_date.isoformat(),
        end_date.isoformat(),
        repositories.api_enabled(),
        api_client.api_base_url(),
    )


def normalize_entries_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    if "priority_label" not in df.columns:
        df["priority_label"] = ""
    if "priority_done" not in df.columns:
        df["priority_done"] = 0
    if "mood_note" not in df.columns:
        df["mood_note"] = ""
    if "mood_media_url" not in df.columns:
        df["mood_media_url"] = ""
    if "mood_tags_json" not in df.columns:
        df["mood_tags_json"] = ""
    if "updated_at" not in df.columns:
        df["updated_at"] = ""
    df["date"] = pd.to_datetime(df["date"]).dt.date
    for key, _ in HABITS:
        if key not in df.columns:
            df[key] = 0
        df[key] = df[key].fillna(0).astype(int)
    df["priority_done"] = df["priority_done"].fillna(0).astype(int)
    df["priority_label"] = df["priority_label"].fillna("").astype(str)
    mood_map_legacy = {
        "Anger": "Raiva",
        "Anxiety": "Ansiedade",
        "Sadness": "Medo",
        "Joy": "Felicidade",
        "Calm": "Paz",
        "Neutral": "Neutro",
    }
    df["mood_category"] = df["mood_category"].replace(mood_map_legacy)
    df = df.sort_values("date")
    return df


@st.cache_data(ttl=120, show_spinner=False)
def load_data_for_email_cached(user_email, database_url, api_enabled, api_base, start_iso, end_iso):
    if api_enabled:
        try:
            payload = api_client.request(
                "GET",
                "/v1/entries",
                params={"start": start_iso, "end": end_iso},
            )
            df = pd.DataFrame(payload.get("items", []))
            return normalize_entries_df(df) if not df.empty else pd.DataFrame(columns=ENTRY_COLUMNS)
        except Exception:
            return pd.DataFrame(columns=ENTRY_COLUMNS)
    engine = get_engine(database_url)
    with engine.connect() as conn:
        df = pd.read_sql(
            sql_text(
                f"SELECT * FROM {ENTRIES_TABLE} "
                "WHERE user_email = :user_email AND date BETWEEN :start_date AND :end_date "
                "ORDER BY date"
            ),
            conn,
            params={"user_email": user_email, "start_date": start_iso, "end_date": end_iso},
        )
    return normalize_entries_df(df)


def load_data_for_email(user_email, start_date, end_date):
    return load_data_for_email_cached(
        user_email,
        get_database_url(),
        repositories.api_enabled(),
        api_client.api_base_url(),
        start_date.isoformat(),
        end_date.isoformat(),
    )


def load_data(start_date, end_date):
    return load_data_for_email(get_current_user_email(), start_date, end_date)


@st.cache_data(ttl=30, show_spinner=False)
def load_today_activities_cached(user_email, day_iso):
    if repositories.api_enabled():
        try:
            payload = api_client.request("GET", "/v1/tasks", params={"start": day_iso, "end": day_iso})
            return payload.get("items", [])
        except Exception:
            return []
    return repositories.list_activities_for_day(user_email, date.fromisoformat(day_iso))


@st.cache_data(ttl=30, show_spinner=False)
def load_shared_snapshot_cached(day_iso, user_a, user_b, habit_keys):
    if repositories.api_enabled():
        try:
            return api_client.request("GET", "/v1/couple/streaks")
        except Exception:
            return {"today": day_iso, "habits": [], "summary": "Shared summary unavailable."}
    return repositories.get_shared_habit_comparison(
        date.fromisoformat(day_iso),
        user_a,
        user_b,
        list(habit_keys),
    )


@st.cache_data(ttl=30, show_spinner=False)
def list_todo_tasks_for_window_cached(user_email, database_url, week_start_iso, week_end_iso, selected_iso):
    engine = get_engine(database_url)
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                """
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done, created_at
                FROM todo_tasks
                WHERE user_email = :user_email
                  AND (
                    (scheduled_date BETWEEN :week_start AND :week_end)
                    OR scheduled_date = :selected_date
                    OR (source = 'remembered' AND (scheduled_date IS NULL OR scheduled_date = ''))
                  )
                ORDER BY created_at DESC
                """
            ),
            {
                "user_email": user_email,
                "week_start": week_start_iso,
                "week_end": week_end_iso,
                "selected_date": selected_iso,
            },
        ).mappings().all()
    return [dict(row) for row in rows]


@st.cache_data(ttl=86400, show_spinner=False)
def resolve_pinterest_image_url(pin_url):
    try:
        response = requests.get(
            pin_url,
            timeout=25,
            allow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        response.raise_for_status()
    except Exception:
        return ""
    return _extract_meta_image(response.text)


def _extract_meta_image(page_html):
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, page_html, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


@st.cache_data(ttl=86400, show_spinner=False)
def get_aesthetic_image_urls(pin_urls):
    image_urls = []
    for pin_url in pin_urls:
        image_url = resolve_pinterest_image_url(pin_url)
        if image_url:
            image_urls.append(image_url)
    return image_urls
