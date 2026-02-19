import os
import re
import html
from datetime import date, datetime, timedelta
import calendar
from urllib.parse import urlparse
from uuid import uuid4

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import requests
import streamlit as st
from sqlalchemy import create_engine, inspect, text as sql_text

try:
    from icalendar import Calendar
except Exception:
    Calendar = None

try:
    import recurring_ical_events
except Exception:
    recurring_ical_events = None


DB_PATH = os.path.join(os.path.dirname(__file__), "life_dashboard.db")
ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")
LOCAL_SECRETS_PATH = os.path.join(os.path.dirname(__file__), ".streamlit", "secrets.toml")

ENV_FALLBACK_KEYS = {
    ("auth", "redirect_uri"): "AUTH_REDIRECT_URI",
    ("auth", "cookie_secret"): "AUTH_COOKIE_SECRET",
    ("auth", "google", "client_id"): "GOOGLE_CLIENT_ID",
    ("auth", "google", "client_secret"): "GOOGLE_CLIENT_SECRET",
    ("auth", "google", "server_metadata_url"): "GOOGLE_SERVER_METADATA_URL",
    ("app", "allowed_email"): "ALLOWED_EMAIL",
    ("app", "allowed_emails"): "ALLOWED_EMAILS",
    ("database", "url"): "DATABASE_URL",
}

DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
DAY_TO_INDEX = {label: idx for idx, label in enumerate(DAY_LABELS)}

JAHDY_EMAIL = "jahdy.moreno@gmail.com"
GUILHERME_EMAIL = "guilherme.m.rods@gmail.com"
USER_PROFILES = {
    JAHDY_EMAIL: {
        "name": "Jahdy",
    },
    GUILHERME_EMAIL: {
        "name": "Guilherme",
    },
}
SHARED_USER_EMAILS = set(USER_PROFILES.keys())

HABITS = [
    ("bible_reading", "Bible reading"),
    ("bible_study", "Bible study"),
    ("dissertation_work", "Dissertation work"),
    ("workout", "Workout"),
    ("general_reading", "General reading (books)"),
    ("shower", "Shower"),
    ("meeting_attended", "Meeting attended"),
    ("prepare_meeting", "Prepare meeting"),
    ("writing", "Writing"),
    ("scientific_writing", "Scientific Writing"),
]
MEETING_HABIT_KEYS = {"meeting_attended", "prepare_meeting"}

ENTRY_DATA_COLUMNS = [h[0] for h in HABITS] + [
    "sleep_hours",
    "anxiety_level",
    "work_hours",
    "boredom_minutes",
    "mood_category",
    "priority_label",
    "priority_done",
]
ENTRY_COLUMNS = ["date"] + ENTRY_DATA_COLUMNS
ENTRIES_TABLE = "daily_entries_user"
LEGACY_ENTRIES_TABLE = "daily_entries"
TASKS_TABLE = "todo_tasks"
SUBTASKS_TABLE = "todo_subtasks"
CALENDAR_STATUS_TABLE = "calendar_event_status"

MOODS = ["Paz", "Felicidade", "Ansiedade", "Medo", "Raiva", "Neutro"]
MOOD_COLORS = {
    "Paz": "#3772A6",
    "Felicidade": "#8FB6D9",
    "Ansiedade": "#D6D979",
    "Medo": "#D9C979",
    "Raiva": "#D95252",
    "Neutro": "#B8B8B8",
}
MOOD_TO_INT = {m: i for i, m in enumerate(MOODS)}

PRIORITY_TAGS = ["High", "Medium", "Low"]
PRIORITY_META = {
    "High": {"weight": 3, "color": "#D95252"},
    "Medium": {"weight": 2, "color": "#D9C979"},
    "Low": {"weight": 1, "color": "#8FB6D9"},
}

PINTEREST_MOOD_LINKS = [
    "https://pin.it/663z0YrI0",
    "https://pin.it/6X1bivk29",
    "https://pin.it/72wKVio1I",
    "https://pin.it/3NXG9cSQ4",
    "https://pin.it/DPWzlzuoR",
    "https://pin.it/1719yUkPi",
    "https://pin.it/3F61d82Z0",
]


st.set_page_config(page_title="Personal Life Dashboard", layout="wide")


def load_local_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def bootstrap_local_secrets_from_env():
    if os.path.exists(LOCAL_SECRETS_PATH):
        return
    required = [
        "AUTH_REDIRECT_URI",
        "AUTH_COOKIE_SECRET",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
    ]
    if not all(os.getenv(key) for key in required):
        return
    os.makedirs(os.path.dirname(LOCAL_SECRETS_PATH), exist_ok=True)
    metadata_url = os.getenv(
        "GOOGLE_SERVER_METADATA_URL",
        "https://accounts.google.com/.well-known/openid-configuration",
    )
    database_url = os.getenv("DATABASE_URL", "")
    allowed_email = (os.getenv("ALLOWED_EMAIL") or "").strip()
    allowed_emails = (os.getenv("ALLOWED_EMAILS") or "").strip()
    with open(LOCAL_SECRETS_PATH, "w", encoding="utf-8") as secrets_file:
        secrets_file.write("[auth]\n")
        secrets_file.write(f"redirect_uri = \"{os.getenv('AUTH_REDIRECT_URI')}\"\n")
        secrets_file.write(f"cookie_secret = \"{os.getenv('AUTH_COOKIE_SECRET')}\"\n\n")
        secrets_file.write("[auth.google]\n")
        secrets_file.write(f"client_id = \"{os.getenv('GOOGLE_CLIENT_ID')}\"\n")
        secrets_file.write(f"client_secret = \"{os.getenv('GOOGLE_CLIENT_SECRET')}\"\n")
        secrets_file.write(f"server_metadata_url = \"{metadata_url}\"\n\n")
        if allowed_email or allowed_emails:
            secrets_file.write("[app]\n")
            if allowed_emails:
                secrets_file.write(f"allowed_emails = \"{allowed_emails}\"\n")
            elif allowed_email:
                secrets_file.write(f"allowed_email = \"{allowed_email}\"\n")
            secrets_file.write("\n")
        if database_url:
            secrets_file.write("[database]\n")
            secrets_file.write(f"url = \"{database_url}\"\n")


load_local_env()
bootstrap_local_secrets_from_env()

st.markdown(
    """
<style>
@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

:root {
    --bg-main: #121017;
    --bg-accent: #1a1622;
    --bg-card: #1e1a27;
    --bg-panel: #2a2335;
    --border: #5b4f70;
    --text-main: #f3edf9;
    --text-soft: #c8bbd8;
    --button: #5f4f79;
    --button-hover: #725f90;
    --accent-purple: #8e79af;
}

html, body, [class*="css"] {
    font-family: 'IBM Plex Sans', sans-serif;
    color: var(--text-main);
}

h1, h2, h3, .page-title {
    font-family: 'Crimson Text', serif;
    letter-spacing: 0.4px;
}

.stApp {
    background: radial-gradient(1400px 900px at 20% 0%, #1f1a2a 0%, var(--bg-main) 58%);
    color: var(--text-main);
}

.section-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 8px 0;
}

.card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px 18px;
    margin-bottom: 14px;
    box-shadow: 0 12px 26px rgba(0,0,0,0.35);
}

.small-label {
    color: var(--text-soft);
    font-size: 13px;
    letter-spacing: 0.2px;
}

.stMetric {
    background: var(--bg-card);
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--border);
}

.plotly-graph-div {
    background: var(--bg-accent);
    border-radius: 14px;
}

.stButton>button {
    background: var(--button);
    color: #f6f0ff;
    border: 1px solid #7d6a98;
    border-radius: 10px;
    padding: 8px 14px;
    font-weight: 600;
}

.stButton>button:hover {
    background: var(--button-hover);
    border-color: #9583b1;
}

button[kind="primary"] {
    background: #8e79af !important;
    color: #fdf9ff !important;
    border: 1px solid #a793ca !important;
}

button[kind="primary"]:hover {
    background: #9f89c2 !important;
    border-color: #baaad5 !important;
}

div[data-testid="stForm"] {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px 18px;
}

div[data-testid="stForm"] label {
    color: var(--text-soft);
}

/* Improve contrast on dark background */
.stMarkdown, .stText, .stCaption, .stCaption span,
.stMarkdown p, .stMarkdown li, .stMarkdown span {
    color: var(--text-main);
}

div[data-testid="stMetricLabel"] {
    color: var(--text-soft);
}

div[data-testid="stMetricValue"] {
    color: var(--text-main);
}

label, p, span, div {
    color: var(--text-main);
}

div[data-baseweb="input"] input,
div[data-baseweb="textarea"] textarea,
div[data-baseweb="select"] > div {
    background: var(--bg-panel);
    color: var(--text-main);
    border-color: var(--border);
}

div[data-baseweb="select"] svg {
    color: var(--text-main);
}

label[data-testid="stWidgetLabel"] {
    color: var(--text-main);
}

.stDateInput input, .stDateInput svg {
    color: var(--text-main) !important;
}

.stDateInput input {
    background: var(--bg-panel) !important;
    border-color: var(--border) !important;
}

/* Inputs/select hover/focus contrast */
div[data-baseweb="input"] input:hover,
div[data-baseweb="textarea"] textarea:hover,
div[data-baseweb="select"] > div:hover {
    background: #312944;
    border-color: #7c6a99;
}

div[data-baseweb="input"] input:focus,
div[data-baseweb="textarea"] textarea:focus,
div[data-baseweb="select"] > div:focus,
div[data-baseweb="select"] > div:focus-within {
    background: #352d4a;
    border-color: #8b79a8;
    box-shadow: 0 0 0 2px rgba(142, 121, 175, 0.35);
}

/* Dropdown menu */
div[data-baseweb="menu"],
ul[role="listbox"] {
    background: var(--bg-card) !important;
    color: var(--text-main) !important;
    border: 1px solid var(--border) !important;
}

div[data-baseweb="menu"] li,
ul[role="listbox"] li {
    color: var(--text-main) !important;
}

div[data-baseweb="menu"] li:hover,
ul[role="listbox"] li:hover {
    background: #302840 !important;
}

/* Select dropdown list text */
div[role="listbox"] {
    background: var(--bg-card) !important;
    color: var(--text-main) !important;
    border: 1px solid var(--border) !important;
}

div[role="listbox"] div,
div[role="listbox"] span {
    color: var(--text-main) !important;
}

div[role="listbox"] div:hover,
div[role="listbox"] div:active {
    background: #302840 !important;
}

/* Selectbox (mood) high-contrast override */
div[data-baseweb="select"] * {
    color: var(--text-main) !important;
}

/* Baseweb portal menu for select */
div[data-baseweb="popover"] div[role="listbox"],
div[data-baseweb="popover"] ul[role="listbox"],
div[data-baseweb="popover"] li,
div[data-baseweb="popover"] [role="option"] {
    background: var(--bg-card) !important;
    color: var(--text-main) !important;
    border-color: var(--border) !important;
}

div[data-baseweb="popover"] [role="option"]:hover {
    background: #302840 !important;
    color: var(--text-main) !important;
}

div[data-baseweb="popover"] [role="option"][aria-selected="true"] {
    background: var(--accent-purple) !important;
    color: #fdf9ff !important;
}

/* Datepicker calendar popover */
div[data-baseweb="calendar"] {
    background: var(--bg-card) !important;
    color: var(--text-main) !important;
    border: 1px solid var(--border) !important;
}

div[data-baseweb="calendar"] button {
    color: var(--text-main) !important;
}

div[data-baseweb="calendar"] button:hover {
    background: #302840 !important;
    color: var(--text-main) !important;
}

div[data-baseweb="calendar"] button[aria-selected="true"] {
    background: var(--accent-purple) !important;
    color: #fdf9ff !important;
}

.calendar-month {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 10px;
    margin: 8px 0 12px 0;
}

.calendar-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 6px;
}

.calendar-table th {
    text-align: center;
    color: var(--text-soft);
    font-size: 12px;
    font-weight: 600;
    padding-bottom: 2px;
}

.calendar-cell {
    height: 74px;
    vertical-align: top;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-panel);
    padding: 6px;
}

.calendar-cell.empty {
    background: rgba(255, 255, 255, 0.02);
    border-style: dashed;
}

.calendar-cell.selected {
    border-color: #8FB6D9;
    box-shadow: inset 0 0 0 1px rgba(143, 182, 217, 0.45);
}

.calendar-day {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 6px;
}

.calendar-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}

.cal-badge {
    font-size: 10px;
    border-radius: 999px;
    padding: 1px 6px;
    border: 1px solid transparent;
    cursor: help;
}

.cal-google {
    color: #8FB6D9;
    background: rgba(143, 182, 217, 0.18);
    border-color: rgba(143, 182, 217, 0.35);
}

.cal-task {
    color: #D9C979;
    background: rgba(217, 201, 121, 0.2);
    border-color: rgba(217, 201, 121, 0.36);
}

.cal-none {
    color: #9f95ad;
    background: rgba(159, 149, 173, 0.16);
    border-color: rgba(159, 149, 173, 0.25);
}

.aesthetic-wrap {
    margin: 10px 0 14px 0;
}

.aesthetic-mosaic {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 8px;
}

.aesthetic-tile {
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    min-height: 82px;
}

.aesthetic-tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: saturate(0.82) contrast(0.92) brightness(0.86);
}

.aesthetic-1 { grid-column: span 4; grid-row: span 2; min-height: 176px; }
.aesthetic-2 { grid-column: span 4; min-height: 84px; }
.aesthetic-3 { grid-column: span 4; min-height: 84px; }
.aesthetic-4 { grid-column: span 3; min-height: 90px; }
.aesthetic-5 { grid-column: span 3; min-height: 90px; }
.aesthetic-6 { grid-column: span 3; min-height: 90px; }
.aesthetic-7 { grid-column: span 3; min-height: 90px; }

@media (max-width: 900px) {
    .aesthetic-1,
    .aesthetic-2,
    .aesthetic-3,
    .aesthetic-4,
    .aesthetic-5,
    .aesthetic-6,
    .aesthetic-7 {
        grid-column: span 6;
        min-height: 100px;
    }
}

.aesthetic-side {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 74px;
    gap: 7px;
    margin-top: 6px;
}

.aesthetic-side-item {
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
}

.aesthetic-side-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: saturate(0.78) contrast(0.9) brightness(0.84);
}

.aesthetic-side-1 { grid-column: span 2; grid-row: span 2; }
.aesthetic-side-2 { grid-column: span 1; grid-row: span 1; }
.aesthetic-side-3 { grid-column: span 1; grid-row: span 1; }
.aesthetic-side-4 { grid-column: span 2; grid-row: span 1; }

div[data-testid="stHeader"], div[data-testid="stToolbar"] {
    visibility: hidden;
    height: 0px;
}
</style>
""",
    unsafe_allow_html=True,
)


st.markdown("<div class='page-title' style='font-size:30px;'>Personal Life Dashboard</div>", unsafe_allow_html=True)


def get_secret(path, default=None):
    env_key = ENV_FALLBACK_KEYS.get(tuple(path))
    if env_key:
        env_value = os.getenv(env_key)
        if env_value:
            return env_value
    current = st.secrets
    for key in path:
        try:
            if key not in current:
                return default
            current = current[key]
        except Exception:
            return default
    return current


def get_database_url():
    return (
        get_secret(("database", "url"))
        or os.getenv("DATABASE_URL")
        or f"sqlite:///{DB_PATH}"
    )


def auth_configured():
    return bool(
        get_secret(("auth", "redirect_uri"))
        and get_secret(("auth", "cookie_secret"))
        and get_secret(("auth", "google", "client_id"))
        and get_secret(("auth", "google", "client_secret"))
    )


def enforce_google_login():
    if not auth_configured():
        st.markdown("<div class='section-title'>Google Login Setup Required</div>", unsafe_allow_html=True)
        st.markdown("Configure Google OAuth in Streamlit Cloud secrets before using the app.")
        st.code(
            "[auth]\n"
            "redirect_uri = \"https://YOUR-APP.streamlit.app/oauth2callback\"\n"
            "cookie_secret = \"LONG_RANDOM_SECRET\"\n\n"
            "[auth.google]\n"
            "client_id = \"YOUR_CLIENT_ID\"\n"
            "client_secret = \"YOUR_CLIENT_SECRET\"\n"
            "server_metadata_url = \"https://accounts.google.com/.well-known/openid-configuration\"\n\n"
            "[app]\n"
            "allowed_emails = \"jahdy.moreno@gmail.com,guilherme.m.rods@gmail.com\"",
            language="toml",
        )
        st.stop()

    allowed_raw = (
        get_secret(("app", "allowed_emails"))
        or get_secret(("app", "allowed_email"))
        or os.getenv("ALLOWED_EMAILS")
        or os.getenv("ALLOWED_EMAIL")
        or ""
    )
    allowed_set = {
        email.strip().lower()
        for email in str(allowed_raw).split(",")
        if email.strip()
    }
    if allowed_set:
        allowed_set = allowed_set | SHARED_USER_EMAILS
    else:
        allowed_set = set(SHARED_USER_EMAILS)

    redirect_uri = (get_secret(("auth", "redirect_uri")) or "").strip()
    parsed_uri = urlparse(redirect_uri) if redirect_uri else None
    if not redirect_uri or parsed_uri.path != "/oauth2callback":
        st.error(
            "Invalid auth.redirect_uri. For Streamlit st.login it must end with "
            "/oauth2callback (example: https://your-app.streamlit.app/oauth2callback)."
        )
        st.stop()

    if not st.user.is_logged_in:
        st.markdown("<div class='section-title'>Login Required</div>", unsafe_allow_html=True)
        st.markdown("Use your Google account to access your private dashboard.")
        if st.button("Login with Google", key="google_login"):
            st.login("google")
        st.stop()

    user_email = str(getattr(st.user, "email", "")).strip().lower()
    if allowed_set and user_email not in allowed_set:
        st.error("Access denied for this account.")
        if st.button("Logout", key="logout_denied"):
            st.logout()
        st.stop()

    with st.sidebar:
        st.caption(f"Logged as: {getattr(st.user, 'email', 'unknown')}")
        if st.button("Logout", key="logout_sidebar"):
            st.logout()


def get_current_user_email():
    user_email = str(getattr(st.user, "email", "")).strip().lower()
    if user_email:
        return user_email
    allowed_many = (
        get_secret(("app", "allowed_emails"))
        or os.getenv("ALLOWED_EMAILS")
        or ""
    ).strip()
    fallback_from_many = ""
    if allowed_many:
        fallback_from_many = allowed_many.split(",")[0].strip().lower()
    fallback_email = (
        fallback_from_many
        or get_secret(("app", "allowed_email"))
        or os.getenv("ALLOWED_EMAIL")
        or "local@offline"
    ).strip().lower()
    return fallback_email or "local@offline"


def get_display_name(user_email):
    profile_name = USER_PROFILES.get(user_email, {}).get("name")
    if profile_name:
        return profile_name
    user_name = str(getattr(st.user, "name", "")).strip()
    if user_name:
        return user_name.split()[0]
    local = (user_email or "").split("@")[0].replace(".", " ").strip()
    return local.title() if local else "User"


def get_partner_email(user_email):
    if user_email == JAHDY_EMAIL:
        return GUILHERME_EMAIL
    if user_email == GUILHERME_EMAIL:
        return JAHDY_EMAIL
    return None


def get_user_calendar_secret_keys(user_email):
    if user_email == JAHDY_EMAIL:
        return "JAHDY_GOOGLE_CALENDAR_ICS", "jahdy_google_calendar_ics"
    if user_email == GUILHERME_EMAIL:
        return "GUILHERME_GOOGLE_CALENDAR_ICS", "guilherme_google_calendar_ics"
    local_name = (user_email or "").split("@")[0].replace(".", "_").upper()
    env_key = f"{local_name}_GOOGLE_CALENDAR_ICS"
    return env_key, env_key.lower()


def get_user_calendar_ics_url(user_email):
    env_key, normalized_key = get_user_calendar_secret_keys(user_email)
    candidates = [
        os.getenv(env_key),
        get_secret((env_key,)),
        get_secret((env_key.lower(),)),
        get_secret(("calendar", env_key)),
        get_secret(("calendar", env_key.lower())),
        get_secret(("calendar", normalized_key)),
        get_secret(("app", env_key)),
        get_secret(("app", env_key.lower())),
        get_secret(("app", normalized_key)),
        get_setting("calendar_ics_url"),
    ]
    for value in candidates:
        if value and str(value).strip():
            return str(value).strip(), env_key
    return "", env_key


def scoped_setting_key(key):
    return f"{get_current_user_email()}::{key}"


@st.cache_resource
def get_engine(database_url):
    if database_url.startswith("sqlite"):
        return create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            future=True,
        )
    return create_engine(database_url, pool_pre_ping=True, future=True)


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
                    priority_label TEXT,
                    priority_done INTEGER DEFAULT 0,
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

    def ensure_column(table_name, column_name, column_ddl):
        try:
            with engine.begin() as conn:
                conn.execute(
                    sql_text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_ddl}")
                )
        except Exception:
            pass

    ensure_column(TASKS_TABLE, "priority_tag", "TEXT DEFAULT 'Medium'")
    ensure_column(TASKS_TABLE, "estimated_minutes", "INTEGER")
    ensure_column(TASKS_TABLE, "actual_minutes", "INTEGER")
    ensure_column(TASKS_TABLE, "external_event_key", "TEXT")
    ensure_column(SUBTASKS_TABLE, "priority_tag", "TEXT DEFAULT 'Medium'")
    ensure_column(SUBTASKS_TABLE, "estimated_minutes", "INTEGER")
    ensure_column(SUBTASKS_TABLE, "actual_minutes", "INTEGER")
    ensure_column(CALENDAR_STATUS_TABLE, "is_hidden", "INTEGER DEFAULT 0")

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


def get_meeting_days():
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


def save_meeting_days():
    labels = st.session_state.get("meeting_days_labels", [])
    days = [DAY_TO_INDEX[label] for label in labels]
    st.session_state["meeting_days"] = days
    set_setting("meeting_days", ",".join(map(str, days)))


def normalize_entries_df(df):
    if df.empty:
        return df
    if "priority_label" not in df.columns:
        df["priority_label"] = ""
    if "priority_done" not in df.columns:
        df["priority_done"] = 0
    df["date"] = pd.to_datetime(df["date"]).dt.date
    for key, _ in HABITS:
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


def load_data_for_email(user_email):
    engine = get_engine(get_database_url())
    with engine.connect() as conn:
        df = pd.read_sql(
            sql_text(
                f"SELECT * FROM {ENTRIES_TABLE} "
                "WHERE user_email = :user_email ORDER BY date"
            ),
            conn,
            params={"user_email": user_email},
        )
    return normalize_entries_df(df)


def load_data():
    return load_data_for_email(get_current_user_email())


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
    return payload["id"]


def list_todo_tasks():
    engine = get_engine(get_database_url())
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done, created_at
                FROM {TASKS_TABLE}
                WHERE user_email = :user_email
                ORDER BY created_at DESC
                """
            ),
            {"user_email": get_current_user_email()},
        ).mappings().all()
    return [dict(row) for row in rows]


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


def get_todo_task_subtasks(task_id):
    engine = get_engine(get_database_url())
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT
                    id, task_id, user_email, title, priority_tag, estimated_minutes, actual_minutes,
                    is_done, created_at
                FROM {SUBTASKS_TABLE}
                WHERE user_email = :user_email AND task_id = :task_id
                ORDER BY created_at ASC
                """
            ),
            {"user_email": get_current_user_email(), "task_id": task_id},
        ).mappings().all()
    return [dict(row) for row in rows]


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
        response = requests.get(ics_url, timeout=20)
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
        components = [component for component in calendar_obj.walk() if component.name == "VEVENT"]

    start_iso = start_date.isoformat()
    end_iso = end_date.isoformat()
    events = []
    seen_keys = set()
    for component in components:
        event_payload = _normalize_event_component(component)
        if not event_payload:
            continue
        if event_payload["end_date"] < start_iso or event_payload["start_date"] > end_iso:
            continue
        if event_payload["event_key"] in seen_keys:
            continue
        seen_keys.add(event_payload["event_key"])
        events.append(event_payload)

    events.sort(key=lambda item: (item["start_time"] is None, item["start_time"] or "23:59", item["title"]))
    return events, None


def fetch_ics_events_for_date(ics_url, target_date):
    return fetch_ics_events_for_range(ics_url, target_date, target_date)


def filter_events_for_date(events, target_date):
    target_iso = target_date.isoformat()
    day_events = [
        event
        for event in events
        if event["start_date"] <= target_iso <= event["end_date"]
    ]
    day_events.sort(key=lambda item: (item["start_time"] is None, item["start_time"] or "23:59", item["title"]))
    return day_events


def build_event_count_map(events, start_date, end_date):
    counts = {}
    for event in events:
        try:
            event_start = date.fromisoformat(event["start_date"])
            event_end = date.fromisoformat(event["end_date"])
        except Exception:
            continue
        current = max(event_start, start_date)
        last = min(event_end, end_date)
        while current <= last:
            counts[current] = counts.get(current, 0) + 1
            current += timedelta(days=1)
    return counts


def build_event_detail_map(events, start_date, end_date, max_items=4):
    detail_map = {}
    for event in events:
        try:
            event_start = date.fromisoformat(event["start_date"])
            event_end = date.fromisoformat(event["end_date"])
        except Exception:
            continue
        time_label = event.get("start_time") or "All day"
        line = f"{time_label} • {event.get('title', 'Event')}"
        current = max(event_start, start_date)
        last = min(event_end, end_date)
        while current <= last:
            detail_map.setdefault(current, []).append(line)
            current += timedelta(days=1)
    compact = {}
    for day, lines in detail_map.items():
        shown = lines[:max_items]
        if len(lines) > max_items:
            shown.append(f"... +{len(lines) - max_items} more")
        compact[day] = "\n".join(shown)
    return compact


def build_task_count_map(tasks, start_date, end_date):
    counts = {}
    for task in tasks:
        raw_date = task.get("scheduled_date")
        if not raw_date:
            continue
        try:
            task_date = date.fromisoformat(raw_date)
        except Exception:
            continue
        if start_date <= task_date <= end_date:
            counts[task_date] = counts.get(task_date, 0) + 1
    return counts


def build_task_detail_map(tasks, start_date, end_date, max_items=4):
    detail_map = {}
    for task in tasks:
        raw_date = task.get("scheduled_date")
        if not raw_date:
            continue
        try:
            task_date = date.fromisoformat(raw_date)
        except Exception:
            continue
        if not (start_date <= task_date <= end_date):
            continue
        time_label = task.get("scheduled_time") or "No time"
        line = f"{time_label} • {task.get('title', 'Task')}"
        detail_map.setdefault(task_date, []).append(line)
    compact = {}
    for day, lines in detail_map.items():
        shown = lines[:max_items]
        if len(lines) > max_items:
            shown.append(f"... +{len(lines) - max_items} more")
        compact[day] = "\n".join(shown)
    return compact


def get_week_range(reference_date):
    week_start = reference_date - timedelta(days=reference_date.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def build_week_calendar_html(
    week_start,
    selected_date,
    google_counts,
    task_counts,
    google_details,
    task_details,
):
    days = [week_start + timedelta(days=offset) for offset in range(7)]
    header_cells = "".join(
        [
            (
                f"<th>{DAY_LABELS[idx]}<br>"
                f"<span style='font-size:10px;color:#9f95ad;'>{day.strftime('%d/%m')}</span></th>"
            )
            for idx, day in enumerate(days)
        ]
    )
    cells = []
    for day in days:
        google_count = google_counts.get(day, 0)
        task_count = task_counts.get(day, 0)
        classes = "calendar-cell selected" if day == selected_date else "calendar-cell"
        badges = []
        if google_count:
            tooltip = html.escape(google_details.get(day, "Google events"), quote=True)
            badges.append(
                f"<span class='cal-badge cal-google' title='{tooltip}'>G {google_count}</span>"
            )
        if task_count:
            tooltip = html.escape(task_details.get(day, "Scheduled tasks"), quote=True)
            badges.append(
                f"<span class='cal-badge cal-task' title='{tooltip}'>T {task_count}</span>"
            )
        if not badges:
            badges.append("<span class='cal-badge cal-none'>-</span>")
        cells.append(
            (
                f"<td class='{classes}'>"
                f"<div class='calendar-day'>{day.day}</div>"
                f"<div class='calendar-badges'>{''.join(badges)}</div>"
                "</td>"
            )
        )
    return (
        "<div class='calendar-month'>"
        "<table class='calendar-table'>"
        f"<thead><tr>{header_cells}</tr></thead>"
        f"<tbody><tr>{''.join(cells)}</tr></tbody>"
        "</table>"
        "</div>"
    )


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


@st.cache_data(ttl=86400, show_spinner=False)
def get_aesthetic_image_urls(pin_urls):
    image_urls = []
    for pin_url in pin_urls:
        image_url = resolve_pinterest_image_url(pin_url)
        if image_url:
            image_urls.append(image_url)
    return image_urls


def build_aesthetic_mosaic_html(image_urls):
    if not image_urls:
        return ""
    tiles = [image_urls[idx % len(image_urls)] for idx in range(7)]
    blocks = []
    for idx, image_url in enumerate(tiles, start=1):
        safe_url = image_url.replace('"', "%22")
        blocks.append(
            (
                f"<div class='aesthetic-tile aesthetic-{idx}'>"
                f"<img src='{safe_url}' loading='lazy' alt='Aesthetic mood' />"
                "</div>"
            )
        )
    return (
        "<div class='aesthetic-wrap'>"
        "<div class='aesthetic-mosaic'>"
        f"{''.join(blocks)}"
        "</div>"
        "</div>"
    )


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


def build_hourly_schedule_rows(items):
    all_day = [item["title"] for item in items if item.get("time") is None]
    rows = []
    if all_day:
        rows.append({"Hour": "All day", "Scheduled": " | ".join(all_day)})
    for hour in range(6, 23):
        hour_key = f"{hour:02d}:00"
        bucket = []
        for item in items:
            item_time = item.get("time")
            if not item_time:
                continue
            if item_time[:2] == f"{hour:02d}":
                bucket.append(item["title"])
        rows.append({"Hour": hour_key, "Scheduled": " | ".join(bucket) if bucket else ""})
    return rows


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


def streak_count(data, habit_key, today):
    if data.empty:
        return 0
    habit_map = {row["date"]: int(row.get(habit_key, 0)) for _, row in data.iterrows()}
    count = 0
    current = today
    while True:
        if current not in habit_map:
            break
        if habit_map[current] != 1:
            break
        count += 1
        current -= timedelta(days=1)
    return count


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


def compute_habits_metrics(row, meeting_days):
    total = len(HABITS)
    completed = 0
    weekday = row["date"].weekday()
    for key, _ in HABITS:
        if key in ("meeting_attended", "prepare_meeting") and weekday not in meeting_days:
            total -= 1
            continue
        completed += int(row.get(key, 0) or 0)
    priority_label = (row.get("priority_label") or "").strip()
    if priority_label:
        total += 1
        completed += int(row.get("priority_done", 0) or 0)
    percent = round((completed / total) * 100, 1) if total > 0 else 0
    return completed, percent, total


def apply_common_plot_style(fig, title, show_xgrid=True, show_ygrid=True):
    fig.update_layout(
        title=title,
        title_font=dict(color="#f3edf9", size=16, family="Crimson Text"),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#ddd1ea", family="IBM Plex Sans"),
        margin=dict(l=40, r=20, t=40, b=30),
        xaxis=dict(
            showgrid=show_xgrid,
            gridcolor="#3d3550",
            tickfont=dict(color="#c8bbd8"),
            zeroline=False,
            showline=True,
            linecolor="#5b4f70",
            mirror=True,
        ),
        yaxis=dict(
            showgrid=show_ygrid,
            gridcolor="#3d3550",
            zeroline=False,
            tickfont=dict(color="#c8bbd8"),
            showline=True,
            linecolor="#5b4f70",
            mirror=True,
        ),
    )
    return fig


def build_month_tracker_grid(year, month, mood_map):
    days_in_month = calendar.monthrange(year, month)[1]
    z = np.full((31, 1), np.nan)
    text = [["" for _ in range(1)] for _ in range(31)]
    for day in range(1, days_in_month + 1):
        current = date(year, month, day)
        mood = mood_map.get(current)
        row = day - 1
        if mood:
            z[row, 0] = MOOD_TO_INT.get(mood, np.nan)
            text[row][0] = f"{current.isoformat()} • {mood}"
        else:
            text[row][0] = f"{current.isoformat()} • No entry"
    month_label = date(year, month, 1).strftime("%b")
    return z, text, [month_label], list(range(1, 32))


def build_year_tracker_grid(year, mood_map):
    z = np.full((31, 12), np.nan)
    text = [["" for _ in range(12)] for _ in range(31)]
    for month in range(1, 13):
        days_in_month = calendar.monthrange(year, month)[1]
        for day in range(1, days_in_month + 1):
            current = date(year, month, day)
            mood = mood_map.get(current)
            row = day - 1
            col = month - 1
            if mood:
                z[row, col] = MOOD_TO_INT.get(mood, np.nan)
                text[row][col] = f"{current.isoformat()} • {mood}"
            else:
                text[row][col] = f"{current.isoformat()} • No entry"
    month_labels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]
    return z, text, month_labels, list(range(1, 32))


def mood_heatmap(z, hover_text, x_labels, y_labels, title=""):
    colorscale = []
    n = len(MOODS)
    for i, mood in enumerate(MOODS):
        color = MOOD_COLORS[mood]
        start = i / n
        end = (i + 1) / n
        colorscale.append((start, color))
        colorscale.append((end - 1e-6, color))

    fig = go.Figure(
        data=go.Heatmap(
            z=z,
            text=hover_text,
            hoverinfo="text",
            colorscale=colorscale,
            showscale=False,
            zmin=0,
            zmax=len(MOODS) - 1,
            xgap=2,
            ygap=2,
        )
    )

    fig.update_layout(
        title=title,
        title_font=dict(color="#f3edf9", size=16, family="Crimson Text"),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#ddd1ea", family="IBM Plex Sans"),
        margin=dict(l=20, r=20, t=40, b=20),
        xaxis=dict(
            showgrid=False,
            zeroline=False,
            tickfont=dict(color="#c8bbd8", size=11),
            tickmode="array",
            tickvals=list(range(len(x_labels))),
            ticktext=x_labels,
            side="top",
            showline=True,
            linecolor="#5b4f70",
            mirror=True,
        ),
        yaxis=dict(
            showgrid=False,
            zeroline=False,
            tickmode="array",
            tickvals=list(range(len(y_labels))),
            ticktext=y_labels,
            autorange="reversed",
            tickfont=dict(color="#c8bbd8", size=10),
            showline=True,
            linecolor="#5b4f70",
            mirror=True,
        ),
    )

    return fig


def dot_chart(values, dates, title, color, height=260):
    fig = go.Figure(
        data=go.Scatter(
            x=values,
            y=dates,
            mode="lines+markers",
            line=dict(color=color, width=2),
            marker=dict(size=8, color=color, line=dict(width=1, color="#ddd1ea")),
        )
    )
    apply_common_plot_style(fig, title, show_xgrid=True, show_ygrid=True)
    fig.update_layout(height=height)
    fig.update_yaxes(categoryorder="array", categoryarray=list(dates), automargin=True)
    fig.update_xaxes(tickfont=dict(size=10, color="#c8bbd8"))
    return fig


enforce_google_login()
init_db()

current_user_email = get_current_user_email()
current_user_name = get_display_name(current_user_email)
current_user_profile = USER_PROFILES.get(current_user_email, {})
partner_email = get_partner_email(current_user_email)
partner_name = get_display_name(partner_email) if partner_email else "Partner"
partner_data = load_data_for_email(partner_email) if partner_email else pd.DataFrame()

st.markdown(
    f"<div class='small-label' style='margin-bottom:10px;'>Welcome, <strong>{current_user_name}</strong>.</div>",
    unsafe_allow_html=True,
)
aesthetic_image_urls = get_aesthetic_image_urls(tuple(PINTEREST_MOOD_LINKS))

meeting_days = get_meeting_days()
if "meeting_days" not in st.session_state:
    st.session_state["meeting_days"] = meeting_days
meeting_days = st.session_state["meeting_days"]

data = load_data()
if not data.empty:
    metrics = data.apply(
        lambda row: compute_habits_metrics(row, meeting_days),
        axis=1,
        result_type="expand",
    )
    data["habits_completed"] = metrics[0]
    data["habits_percent"] = metrics[1]
    data["habits_total"] = metrics[2]
    data["life_balance_score"] = data.apply(compute_balance_score, axis=1)
    data["weekday"] = data["date"].apply(lambda d: d.weekday())
    data["is_weekend"] = data["weekday"] >= 5

# --- LIFE BALANCE SCORE ---

st.markdown("<div class='section-title'>Life Balance Score</div>", unsafe_allow_html=True)

if data.empty:
    st.markdown("Add today’s entry to calculate your Life Balance Score.")
else:
    today = date.today()
    today_row = data[data["date"] == today]
    if today_row.empty:
        st.markdown("No entry for today yet.")
    else:
        score = float(today_row.iloc[0]["life_balance_score"])
        if score < 40:
            score_color = "#D95252"
        elif score < 70:
            score_color = "#D6D979"
        else:
            score_color = "#4FA36C"

        st.markdown(
            f"<div style='font-size:54px; font-weight:700; color:{score_color}; line-height:1;'>{score}</div>",
            unsafe_allow_html=True,
        )

        weekly_start = today - timedelta(days=6)
        weekly = data[(data["date"] >= weekly_start) & (data["date"] <= today)]
        if len(weekly) > 1:
            percentile = round((weekly["life_balance_score"] < score).sum() / len(weekly) * 100)
            st.caption(f"Today you are more balanced than {percentile}% of your week.")
        else:
            st.caption("Add more days this week to see your weekly comparison.")

        boredom_zero = zero_boredom_streak(data, today)
        if boredom_zero >= 5:
            st.warning("You may need mental quiet time.")

        streak_cols = st.columns(4)
        streak_cols[0].markdown(f"🔥 {streak_count(data, 'dissertation_work', today)} day study streak")
        streak_cols[1].markdown(f"📖 {streak_count(data, 'bible_reading', today)} day reading streak")
        streak_cols[2].markdown(f"🏃 {streak_count(data, 'workout', today)} day workout streak")
        streak_cols[3].markdown(f"🚿 {streak_count(data, 'shower', today)} day shower streak")

        if partner_email:
            st.markdown(
                "<div class='small-label' style='margin-top:8px;'>Shared streak comparison</div>",
                unsafe_allow_html=True,
            )
            my_study = streak_count(data, "dissertation_work", today)
            my_read = streak_count(data, "bible_reading", today)
            my_workout = streak_count(data, "workout", today)
            my_shower = streak_count(data, "shower", today)

            partner_study = streak_count(partner_data, "dissertation_work", today)
            partner_read = streak_count(partner_data, "bible_reading", today)
            partner_workout = streak_count(partner_data, "workout", today)
            partner_shower = streak_count(partner_data, "shower", today)

            compare_cols = st.columns(4)
            compare_cols[0].metric("Study", f"{my_study}d", delta=f"{partner_name}: {partner_study}d")
            compare_cols[1].metric("Reading", f"{my_read}d", delta=f"{partner_name}: {partner_read}d")
            compare_cols[2].metric("Workout", f"{my_workout}d", delta=f"{partner_name}: {partner_workout}d")
            compare_cols[3].metric("Shower", f"{my_shower}d", delta=f"{partner_name}: {partner_shower}d")

# --- DAILY INPUT PANEL ---

st.markdown("<div class='section-title'>Daily Workspace</div>", unsafe_allow_html=True)

if "selected_date" not in st.session_state:
    st.session_state["selected_date"] = date.today()

selected_date = st.date_input("Date", key="selected_date")
entry = get_entry_for_date(selected_date, data)
load_entry_into_state(selected_date, entry)
is_meeting_day = selected_date.weekday() in meeting_days
if not is_meeting_day:
    st.session_state["input_meeting_attended"] = False
    st.session_state["input_prepare_meeting"] = False

left_col, right_col = st.columns([1, 1.3], gap="large")

with left_col:
    st.markdown("<div class='section-title'>Habits</div>", unsafe_allow_html=True)

    last_saved = st.session_state.get("last_saved_at")
    if last_saved:
        st.caption(f"Auto-save enabled. Last saved at {last_saved}.")
    else:
        st.caption("Auto-save enabled. Changes save instantly.")

    st.markdown("<div class='small-label' style='margin-top:4px;'>Meeting schedule</div>", unsafe_allow_html=True)
    if "meeting_days_labels" not in st.session_state:
        st.session_state["meeting_days_labels"] = [DAY_LABELS[i] for i in meeting_days]
    st.multiselect(
        "Weekly meeting days",
        options=DAY_LABELS,
        key="meeting_days_labels",
        on_change=save_meeting_days,
    )

    if not is_meeting_day:
        st.caption("Meeting habits are hidden on non-meeting days.")

    st.markdown("<div class='small-label' style='margin-top:6px;'>Daily priority habit</div>", unsafe_allow_html=True)
    priority_cols = st.columns([3, 1])
    with priority_cols[0]:
        st.text_input("Priority focus for today", key="input_priority_label", on_change=auto_save)
    with priority_cols[1]:
        disabled_priority = not bool(st.session_state.get("input_priority_label", "").strip())
        st.checkbox("Done", key="input_priority_done", on_change=auto_save, disabled=disabled_priority)

    st.markdown("<div class='small-label'>Habits</div>", unsafe_allow_html=True)
    habit_cols = st.columns(2)
    habit_index = 0
    for key, label in HABITS:
        if key in MEETING_HABIT_KEYS and not is_meeting_day:
            continue
        with habit_cols[habit_index % 2]:
            st.checkbox(label, key=f"input_{key}", on_change=auto_save)
        habit_index += 1

    st.markdown("<div class='small-label' style='margin-top:8px;'>Daily Metrics</div>", unsafe_allow_html=True)
    metric_cols = st.columns(2)
    with metric_cols[0]:
        st.number_input(
            "Sleep hours",
            min_value=0.0,
            max_value=12.0,
            step=0.5,
            key="input_sleep_hours",
            on_change=auto_save,
        )
        st.number_input(
            "Anxiety level",
            min_value=1,
            max_value=10,
            step=1,
            key="input_anxiety_level",
            on_change=auto_save,
        )
        st.number_input(
            "Work/study hours",
            min_value=0.0,
            max_value=16.0,
            step=0.5,
            key="input_work_hours",
            on_change=auto_save,
        )
    with metric_cols[1]:
        st.number_input(
            "Boredom minutes",
            min_value=0,
            max_value=60,
            step=5,
            key="input_boredom_minutes",
            on_change=auto_save,
        )
        st.selectbox(
            "Mood category",
            MOODS,
            key="input_mood_category",
            on_change=auto_save,
        )

    with st.expander("Delete Records"):
        delete_mode = st.selectbox("Delete mode", ["Single day", "Date range"])
        if delete_mode == "Single day":
            delete_date = st.date_input("Date to delete", value=date.today(), key="delete_single")
            delete_confirm = st.checkbox("I understand this cannot be undone.", key="delete_confirm_single")
            if st.button("Delete entry", disabled=not delete_confirm):
                deleted = delete_entries(delete_date)
                st.success(f"Deleted {deleted} entr{'y' if deleted == 1 else 'ies'}.")
                st.rerun()
        else:
            start_date = st.date_input(
                "Start date",
                value=date.today() - timedelta(days=7),
                key="delete_start",
            )
            end_date = st.date_input(
                "End date",
                value=date.today(),
                key="delete_end",
            )
            if start_date > end_date:
                st.warning("Start date must be before end date.")
            delete_confirm = st.checkbox("I understand this cannot be undone.", key="delete_confirm_range")
            if st.button("Delete range", disabled=not delete_confirm or start_date > end_date):
                deleted = delete_entries(start_date, end_date)
                st.success(f"Deleted {deleted} entr{'y' if deleted == 1 else 'ies'}.")
                st.rerun()

with right_col:
    st.markdown("<div class='section-title'>Calendar</div>", unsafe_allow_html=True)

    calendar_head_cols = st.columns([3.2, 1.4], gap="small")
    with calendar_head_cols[0]:
        week_reference = st.date_input(
            "Calendar week view",
            value=selected_date,
            key="calendar_week_ref",
        )
        week_start, week_end = get_week_range(week_reference)
        st.caption(f"Week: {week_start.strftime('%d/%m/%Y')} - {week_end.strftime('%d/%m/%Y')}")
    with calendar_head_cols[1]:
        if aesthetic_image_urls:
            st.markdown(build_aesthetic_side_html(aesthetic_image_urls, offset=0), unsafe_allow_html=True)

    ics_url, calendar_secret_key = get_user_calendar_ics_url(current_user_email)
    tasks = list_todo_tasks()
    week_task_counts = build_task_count_map(tasks, week_start, week_end)
    week_task_details = build_task_detail_map(tasks, week_start, week_end)

    week_calendar_events = []
    day_calendar_events = []
    calendar_error = None
    if ics_url:
        week_calendar_events, calendar_error = fetch_ics_events_for_range(ics_url, week_start, week_end)
        if not calendar_error:
            day_calendar_events = filter_events_for_date(week_calendar_events, selected_date)
            if selected_date < week_start or selected_date > week_end:
                day_calendar_events, calendar_error = fetch_ics_events_for_date(ics_url, selected_date)
    else:
        calendar_error = f"Missing private calendar URL in backend secret: {calendar_secret_key}"

    week_google_counts = (
        build_event_count_map(week_calendar_events, week_start, week_end)
        if not calendar_error
        else {}
    )
    week_google_details = (
        build_event_detail_map(week_calendar_events, week_start, week_end)
        if not calendar_error
        else {}
    )
    st.markdown(
        build_week_calendar_html(
            week_start,
            selected_date,
            week_google_counts,
            week_task_counts,
            week_google_details,
            week_task_details,
        ),
        unsafe_allow_html=True,
    )
    st.caption("Legend: `G` = Google events, `T` = your scheduled tasks.")

    if calendar_error:
        st.warning(calendar_error)
    else:
        st.caption(f"{len(day_calendar_events)} Google event(s) on {selected_date.strftime('%d/%m/%Y')}")

    selected_iso = selected_date.isoformat()
    unscheduled_remembered = [
        task for task in tasks
        if task.get("source") == "remembered" and not task.get("scheduled_date")
    ]
    day_internal_tasks = [
        task for task in tasks
        if task.get("scheduled_date") == selected_iso
    ]
    task_subtasks_cache = {
        task["id"]: get_todo_task_subtasks(task["id"])
        for task in day_internal_tasks
    }
    override_tasks_by_event = {}
    for task in day_internal_tasks:
        if task.get("source") == "calendar_override" and task.get("external_event_key"):
            override_tasks_by_event[task["external_event_key"]] = task

    event_status_map = get_calendar_event_status_map(
        selected_date,
        [event["event_key"] for event in day_calendar_events],
    )
    event_done_map = {k: v.get("is_done", False) for k, v in event_status_map.items()}
    event_hidden_map = {k: v.get("is_hidden", False) for k, v in event_status_map.items()}

    st.caption(f"Daily view for {selected_date.strftime('%d/%m/%Y')}")

    calendar_items = []
    linked_task_ids = set()
    for event in day_calendar_events:
        event_key = event["event_key"]
        override_task = override_tasks_by_event.get(event_key)
        if override_task:
            linked_task_ids.add(override_task["id"])
            subtasks = task_subtasks_cache.get(override_task["id"], [])
            progress = get_task_progress(override_task, subtasks)
            calendar_items.append(
                {
                    "id": override_task["id"],
                    "source": "calendar_override",
                    "title": override_task.get("title") or event.get("title") or "",
                    "time_label": format_time_interval(
                        override_task.get("scheduled_time") or event.get("start_time"),
                        override_task.get("estimated_minutes"),
                    ),
                    "time_sort": normalize_time_value(override_task.get("scheduled_time") or event.get("start_time")) or "23:59",
                    "done": progress >= 100,
                    "has_subtasks": len(subtasks) > 0,
                    "priority_tag": normalize_priority_tag(override_task.get("priority_tag")),
                }
            )
            continue

        if event_hidden_map.get(event_key, False):
            continue

        event_done = bool(event_done_map.get(event_key, False))
        if event["is_all_day"]:
            time_label = "All day"
            time_sort = "00:00"
        elif event["start_time"] and event["end_time"]:
            time_label = f"{event['start_time']} - {event['end_time']}"
            time_sort = event["start_time"]
        else:
            time_label = event.get("start_time") or "No time"
            time_sort = event.get("start_time") or "23:59"
        calendar_items.append(
            {
                "id": event_key,
                "source": "calendar",
                "title": event["title"],
                "time_label": time_label,
                "time_sort": time_sort,
                "done": event_done,
                "has_subtasks": False,
                "event_row": event,
            }
        )

    for task in day_internal_tasks:
        if task["id"] in linked_task_ids:
            continue
        subtasks = task_subtasks_cache.get(task["id"], [])
        progress = get_task_progress(task, subtasks)
        task_priority, _, _ = priority_meta(task.get("priority_tag"))
        calendar_items.append(
            {
                "id": task["id"],
                "source": "todo",
                "title": task.get("title") or "",
                "time_label": format_time_interval(
                    task.get("scheduled_time"),
                    task.get("estimated_minutes"),
                ),
                "time_sort": normalize_time_value(task.get("scheduled_time")) or "23:59",
                "done": progress >= 100,
                "has_subtasks": len(subtasks) > 0,
                "priority_tag": task_priority,
            }
        )

    calendar_items.sort(key=lambda item: (item["time_sort"], item["title"]))
    if not calendar_items:
        st.info("No events found for this day.")
    else:
        for item in calendar_items:
            item_key = safe_widget_key(item["id"])
            row_cols = st.columns([0.6, 4.8, 1.8, 1.2, 1.0])
            with row_cols[0]:
                if item["source"] == "calendar":
                    done = st.checkbox(
                        "done",
                        value=item["done"],
                        key=f"calendar_day_done_{item_key}",
                        label_visibility="collapsed",
                    )
                    if done != item["done"]:
                        set_calendar_event_done(item["id"], selected_date, done)
                        st.rerun()
                else:
                    task_row = next((t for t in day_internal_tasks if t["id"] == item["id"]), {})
                    has_actual = parse_minutes(task_row.get("actual_minutes")) is not None
                    done = st.checkbox(
                        "done",
                        value=item["done"],
                        key=f"calendar_task_done_{item_key}",
                        disabled=item["has_subtasks"] or not has_actual,
                        label_visibility="collapsed",
                    )
                    if not item["has_subtasks"] and done != item["done"]:
                        set_todo_task_done(item["id"], done)
                        st.rerun()
            with row_cols[1]:
                st.markdown(f"**{item['title']}**")
            with row_cols[2]:
                st.markdown(item["time_label"])
            with row_cols[3]:
                if item["source"] == "calendar":
                    st.markdown(
                        "<span style='color:#c8bbd8;font-size:12px;'>Google</span>",
                        unsafe_allow_html=True,
                    )
                elif item["source"] == "calendar_override":
                    st.markdown(
                        "<span style='color:#c8bbd8;font-size:12px;'>Custom</span>",
                        unsafe_allow_html=True,
                    )
                else:
                    st.markdown(
                        f"<span style='color:#c8bbd8;font-size:12px;'>{item.get('priority_tag', 'Medium')}</span>",
                        unsafe_allow_html=True,
                    )
            with row_cols[4]:
                if item["source"] == "calendar":
                    if st.button("Custom", key=f"customize_calendar_task_{item_key}"):
                        create_calendar_override_task(item["event_row"], selected_date)
                        st.rerun()
                    if st.button("Delete", key=f"hide_calendar_task_{item_key}"):
                        set_calendar_event_hidden(item["id"], selected_date, True)
                        st.rerun()
                elif st.button("Delete", key=f"delete_calendar_task_{item_key}"):
                    delete_todo_task(item["id"])
                    st.rerun()
            st.divider()

    st.markdown("<div class='small-label' style='margin-top:8px;'>Add activity</div>", unsafe_allow_html=True)

    with st.form("add_manual_task_form"):
        manual_title = st.text_input("Task title", key="manual_task_title")
        manual_priority = st.selectbox("Priority tag", PRIORITY_TAGS, key="manual_task_priority")
        manual_estimated = st.number_input(
            "Estimated minutes",
            min_value=5,
            max_value=600,
            step=5,
            value=30,
            key="manual_task_estimated",
        )
        manual_has_time = st.checkbox("Set a specific hour", key="manual_task_has_time")
        manual_time_value = st.time_input(
            "Start time",
            value=datetime.now().replace(second=0, microsecond=0).time(),
            key="manual_task_time",
            disabled=not manual_has_time,
        )
        add_manual = st.form_submit_button("Add task")
        if add_manual:
            if not (manual_title or "").strip():
                st.warning("Task title is required.")
            else:
                add_todo_task(
                    manual_title,
                    source="manual",
                    scheduled_date=selected_date,
                    scheduled_time=manual_time_value if manual_has_time else None,
                    priority_tag=manual_priority,
                    estimated_minutes=manual_estimated,
                )
                st.rerun()

    with st.form("remember_item_form"):
        remembered_title = st.text_input("Remembered item", key="remembered_task_title")
        remembered_priority = st.selectbox("Priority", PRIORITY_TAGS, key="remembered_task_priority")
        remembered_estimated = st.number_input(
            "Estimated minutes",
            min_value=5,
            max_value=600,
            step=5,
            value=20,
            key="remembered_task_estimated",
        )
        add_remembered = st.form_submit_button("Add to to-decide list")
        if add_remembered:
            if not (remembered_title or "").strip():
                st.warning("Item title is required.")
            else:
                add_todo_task(
                    remembered_title,
                    source="remembered",
                    priority_tag=remembered_priority,
                    estimated_minutes=remembered_estimated,
                )
                st.rerun()

    if unscheduled_remembered:
        st.markdown("<div class='small-label'>To-decide list</div>", unsafe_allow_html=True)
        for task in unscheduled_remembered:
            task_id = task["id"]
            task_key = safe_widget_key(task_id)
            task_priority = normalize_priority_tag(task.get("priority_tag"))
            task_est = int(task.get("estimated_minutes") or 0)
            st.markdown(f"**{task['title']}**")
            plan_cols = st.columns([1.7, 1.7, 1.5, 1.2, 1.0, 1.0])
            with plan_cols[0]:
                plan_date = st.date_input("Date", value=selected_date, key=f"plan_date_{task_key}")
            with plan_cols[1]:
                plan_time = st.time_input(
                    "Time",
                    value=datetime.now().replace(second=0, microsecond=0).time(),
                    key=f"plan_time_{task_key}",
                )
            with plan_cols[2]:
                edit_priority = st.selectbox(
                    "Priority",
                    PRIORITY_TAGS,
                    index=PRIORITY_TAGS.index(task_priority),
                    key=f"plan_priority_{task_key}",
                )
            with plan_cols[3]:
                edit_est = st.number_input(
                    "Est min",
                    min_value=5,
                    max_value=600,
                    step=5,
                    value=max(task_est, 5),
                    key=f"plan_est_{task_key}",
                )
            with plan_cols[4]:
                if st.button("Schedule", key=f"schedule_task_{task_key}"):
                    update_todo_task_fields(
                        task_id,
                        priority_tag=edit_priority,
                        estimated_minutes=edit_est,
                    )
                    schedule_todo_task(task_id, plan_date, plan_time)
                    st.rerun()
            with plan_cols[5]:
                if st.button("Delete", key=f"delete_unscheduled_{task_key}"):
                    delete_todo_task(task_id)
                    st.rerun()
            st.divider()
    else:
        st.caption("No pending items in to-decide list.")

    combined_items = []
    for event in day_calendar_events:
        event_done = bool(event_done_map.get(event["event_key"], False))
        progress = 100.0 if event_done else 0.0
        priority_label, priority_weight, priority_color = compute_auto_priority(
            selected_date,
            event["start_time"],
            "calendar",
            progress,
        )
        combined_items.append(
            {
                "id": event["event_key"],
                "title": event["title"],
                "source": "calendar",
                "time": event["start_time"],
                "done": event_done,
                "progress": progress,
                "priority_label": priority_label,
                "priority_weight": priority_weight,
                "priority_color": priority_color,
                "subtasks": [],
            }
        )

    for task in day_internal_tasks:
        subtasks = task_subtasks_cache.get(task["id"], [])
        progress = get_task_progress(task, subtasks)
        done = progress >= 100
        priority_label, priority_weight, priority_color = priority_meta(task.get("priority_tag"))
        combined_items.append(
            {
                "id": task["id"],
                "title": task.get("title") or "",
                "source": task.get("source", "manual"),
                "time": task.get("scheduled_time"),
                "done": done,
                "progress": progress,
                "priority_label": priority_label,
                "priority_weight": priority_weight,
                "priority_color": priority_color,
                "subtasks": subtasks,
                "task_row": task,
            }
        )

    combined_items.sort(key=lambda item: (-item["priority_weight"], item["time"] or "23:59", item["title"]))
    todo_score = build_todo_score(combined_items)
    st.metric("Total task score", todo_score)
    st.caption(build_time_estimation_insight(day_internal_tasks, task_subtasks_cache))
    st.caption("To complete manual tasks/subtasks, set `Actual min` greater than zero.")
    task_list_head_cols = st.columns([3.3, 1.3], gap="small")
    with task_list_head_cols[0]:
        st.markdown("<div class='small-label'>Daily tasks list</div>", unsafe_allow_html=True)
    with task_list_head_cols[1]:
        if aesthetic_image_urls:
            st.markdown(build_aesthetic_side_html(aesthetic_image_urls, offset=3), unsafe_allow_html=True)
    if not combined_items:
        st.caption("No tasks for this day yet.")
    for item in combined_items:
        task_key = safe_widget_key(item["id"])
        time_suffix = ""
        if item["source"] != "calendar":
            time_suffix = f" ({format_time_interval(item.get('time'), item['task_row'].get('estimated_minutes'))})"
        elif item.get("time"):
            time_suffix = f" ({item['time']})"

        header_cols = st.columns([0.5, 4.4, 1.3, 1.2, 0.9])
        with header_cols[0]:
            if item["source"] == "calendar":
                checked = st.checkbox(
                    "done",
                    value=item["done"],
                    key=f"calendar_done_{task_key}",
                    label_visibility="collapsed",
                )
                if checked != item["done"]:
                    set_calendar_event_done(item["id"], selected_date, checked)
                    st.rerun()
            else:
                has_subtasks = len(item["subtasks"]) > 0
                task_actual = parse_minutes(item["task_row"].get("actual_minutes"))
                checked = st.checkbox(
                    "done",
                    value=item["done"],
                    key=f"task_done_{task_key}",
                    disabled=has_subtasks or task_actual is None,
                    label_visibility="collapsed",
                )
                if not has_subtasks and checked != item["done"]:
                    set_todo_task_done(item["id"], checked)
                    st.rerun()
        with header_cols[1]:
            st.markdown(f"**{item['title']}**{time_suffix}")
        with header_cols[2]:
            st.markdown(
                f"<span style='color:{item['priority_color']};font-weight:600;'>{item['priority_label']}</span>",
                unsafe_allow_html=True,
            )
        with header_cols[3]:
            st.markdown(f"{item['progress']}%")
        with header_cols[4]:
            if item["source"] != "calendar" and st.button("Delete", key=f"delete_task_{task_key}"):
                delete_todo_task(item["id"])
                st.rerun()

        if item["source"] != "calendar":
            task_row = item["task_row"]
            current_task_priority = normalize_priority_tag(task_row.get("priority_tag"))
            current_task_est = int(task_row.get("estimated_minutes") or 0)
            current_task_actual = int(task_row.get("actual_minutes") or 0)
            task_details_cols = st.columns([2.2, 1.4, 1.4])
            with task_details_cols[0]:
                edited_priority = st.selectbox(
                    "Priority tag",
                    PRIORITY_TAGS,
                    index=PRIORITY_TAGS.index(current_task_priority),
                    key=f"task_priority_{task_key}",
                )
            with task_details_cols[1]:
                edited_est = st.number_input(
                    "Estimated min",
                    min_value=0,
                    max_value=600,
                    step=5,
                    value=current_task_est,
                    key=f"task_est_{task_key}",
                )
            with task_details_cols[2]:
                edited_actual = st.number_input(
                    "Actual min",
                    min_value=0,
                    max_value=600,
                    step=5,
                    value=current_task_actual,
                    key=f"task_actual_{task_key}",
                )
            if (
                edited_priority != current_task_priority
                or int(edited_est) != current_task_est
                or int(edited_actual) != current_task_actual
            ):
                update_todo_task_fields(
                    item["id"],
                    priority_tag=edited_priority,
                    estimated_minutes=edited_est,
                    actual_minutes=edited_actual,
                )
                st.rerun()

            for subtask in item["subtasks"]:
                sub_key = safe_widget_key(subtask["id"])
                sub_priority_current = normalize_priority_tag(subtask.get("priority_tag"))
                sub_est_current = int(subtask.get("estimated_minutes") or 0)
                sub_actual_current = int(subtask.get("actual_minutes") or 0)

                sub_cols = st.columns([0.6, 2.8, 1.4, 1.2, 1.2, 0.9])
                with sub_cols[0]:
                    sub_checked = st.checkbox(
                        "done",
                        value=bool(subtask.get("is_done", 0)),
                        key=f"subtask_done_{sub_key}",
                        label_visibility="collapsed",
                        disabled=parse_minutes(subtask.get("actual_minutes")) is None,
                    )
                    if sub_checked != bool(subtask.get("is_done", 0)):
                        set_todo_subtask_done(subtask["id"], sub_checked)
                        st.rerun()
                with sub_cols[1]:
                    st.markdown(f"Subtask: {subtask['title']}")
                with sub_cols[2]:
                    sub_priority_edit = st.selectbox(
                        "Priority",
                        PRIORITY_TAGS,
                        index=PRIORITY_TAGS.index(sub_priority_current),
                        key=f"sub_priority_{sub_key}",
                    )
                with sub_cols[3]:
                    sub_est_edit = st.number_input(
                        "Est",
                        min_value=0,
                        max_value=600,
                        step=5,
                        value=sub_est_current,
                        key=f"sub_est_{sub_key}",
                    )
                with sub_cols[4]:
                    sub_actual_edit = st.number_input(
                        "Actual",
                        min_value=0,
                        max_value=600,
                        step=5,
                        value=sub_actual_current,
                        key=f"sub_actual_{sub_key}",
                    )
                with sub_cols[5]:
                    if st.button("Delete", key=f"delete_subtask_{sub_key}"):
                        delete_todo_subtask(subtask["id"])
                        st.rerun()
                if (
                    sub_priority_edit != sub_priority_current
                    or int(sub_est_edit) != sub_est_current
                    or int(sub_actual_edit) != sub_actual_current
                ):
                    update_todo_subtask_fields(
                        subtask["id"],
                        priority_tag=sub_priority_edit,
                        estimated_minutes=sub_est_edit,
                        actual_minutes=sub_actual_edit,
                    )
                    st.rerun()

            new_sub_cols = st.columns([2.8, 1.4, 1.4, 0.9])
            with new_sub_cols[0]:
                subtask_text = st.text_input(
                    "New subtask",
                    key=f"new_subtask_text_{task_key}",
                    label_visibility="collapsed",
                    placeholder="Add subtask",
                )
            with new_sub_cols[1]:
                new_sub_priority = st.selectbox(
                    "Priority",
                    PRIORITY_TAGS,
                    key=f"new_subtask_priority_{task_key}",
                )
            with new_sub_cols[2]:
                new_sub_est = st.number_input(
                    "Estimated",
                    min_value=5,
                    max_value=600,
                    step=5,
                    value=15,
                    key=f"new_subtask_est_{task_key}",
                )
            with new_sub_cols[3]:
                if st.button("Add", key=f"add_subtask_btn_{task_key}"):
                    add_todo_subtask(
                        item["id"],
                        subtask_text,
                        priority_tag=new_sub_priority,
                        estimated_minutes=new_sub_est,
                    )
                    st.rerun()
        st.divider()

# --- TODAY'S SUMMARY ---

st.markdown("<div class='section-title'>Today's Summary</div>", unsafe_allow_html=True)

summary_container = st.container()

if data.empty:
    summary_container.markdown("No entries yet. Add your first day to get started.")
else:
    today = date.today()

    today_row = data[data["date"] == today]
    cols = summary_container.columns(4)
    if not today_row.empty:
        row = today_row.iloc[0]
        cols[0].metric("Habits completed", int(row["habits_completed"]))
        cols[1].metric("Life Balance Score", row["life_balance_score"])
        cols[2].metric("Sleep hours", row.get("sleep_hours", 0))
        cols[3].metric("Mood", row.get("mood_category", ""))
    else:
        summary_container.markdown("No entry for today yet.")

    # Weekly averages
    weekly_start = today - timedelta(days=6)
    weekly = data[(data["date"] >= weekly_start) & (data["date"] <= today)]
    if not weekly.empty:
        st.markdown("<div class='small-label' style='margin-top:8px;'>Weekly averages (last 7 days)</div>", unsafe_allow_html=True)
        avg_cols = st.columns(4)
        avg_cols[0].metric("Sleep", round(weekly["sleep_hours"].mean(), 1))
        avg_cols[1].metric("Anxiety", round(weekly["anxiety_level"].mean(), 1))
        avg_cols[2].metric("Work hours", round(weekly["work_hours"].mean(), 1))
        avg_cols[3].metric("Boredom min", round(weekly["boredom_minutes"].mean(), 1))

# --- WEEKDAY VS WEEKEND ANALYSIS ---

st.markdown("<div class='section-title'>Weekday vs Weekend Analysis</div>", unsafe_allow_html=True)

if data.empty or data["is_weekend"].nunique() < 2:
    st.markdown("Add more entries across weekdays and weekends to see the comparison.")
else:
    data["focus_score"] = (
        data["work_hours"].fillna(0)
        + data["writing"].fillna(0)
        + data["scientific_writing"].fillna(0)
        + data["dissertation_work"].fillna(0)
    )
    data["rest_score"] = data["sleep_hours"].fillna(0) + data["boredom_minutes"].fillna(0) / 60

    weekday = data[~data["is_weekend"]]
    weekend = data[data["is_weekend"]]

    weekday_focus = round(weekday["focus_score"].mean(), 2)
    weekend_focus = round(weekend["focus_score"].mean(), 2)
    weekday_rest = round(weekday["rest_score"].mean(), 2)
    weekend_rest = round(weekend["rest_score"].mean(), 2)

    analysis_cols = st.columns(4)
    analysis_cols[0].metric("Weekday focus", weekday_focus)
    analysis_cols[1].metric("Weekend focus", weekend_focus)
    analysis_cols[2].metric("Weekday rest", weekday_rest)
    analysis_cols[3].metric("Weekend rest", weekend_rest)

    focus_note = "Weekdays show more work + writing focus." if weekday_focus >= weekend_focus else "Weekends show more work + writing focus."
    rest_note = "Weekends show more rest time." if weekend_rest >= weekday_rest else "Weekdays show more rest time."
    st.markdown(f"{focus_note} {rest_note}")

# --- VERTICAL CHARTS ---

st.markdown("<div class='section-title'>Vertical Charts Analytics</div>", unsafe_allow_html=True)

if data.empty:
    st.markdown("Add entries to generate charts.")
else:
    view = st.selectbox("View", ["Last 7 days", "This month"], index=0)
    if view == "Last 7 days":
        start_date = date.today() - timedelta(days=6)
        filtered = data[data["date"] >= start_date]
    else:
        today = date.today()
        filtered = data[(data["date"].apply(lambda d: d.year == today.year and d.month == today.month))]

    filtered = filtered.sort_values("date")
    filtered["date_str"] = pd.to_datetime(filtered["date"]).dt.strftime("%b %d")

    chart_cols = st.columns(2)

    fig_sleep = dot_chart(filtered["sleep_hours"], filtered["date_str"], "Sleep hours per day", "#a9c0e8")
    chart_cols[0].plotly_chart(fig_sleep, use_container_width=True)

    fig_anxiety = dot_chart(filtered["anxiety_level"], filtered["date_str"], "Anxiety level per day", "#cbb5e2")
    chart_cols[1].plotly_chart(fig_anxiety, use_container_width=True)

    fig_work = dot_chart(filtered["work_hours"], filtered["date_str"], "Work/study hours per day", "#b7d1c9")
    chart_cols[0].plotly_chart(fig_work, use_container_width=True)

    fig_boredom = dot_chart(filtered["boredom_minutes"], filtered["date_str"], "Boredom minutes per day", "#f2d4a2")
    chart_cols[1].plotly_chart(fig_boredom, use_container_width=True)

    fig_habits = dot_chart(filtered["habits_percent"], filtered["date_str"], "Habits completed (%)", "#c9b3e5")
    chart_cols[0].plotly_chart(fig_habits, use_container_width=True)

# --- MOOD PIXEL BOARD ---

st.markdown("<div class='section-title'>Mood Pixel Board</div>", unsafe_allow_html=True)

if data.empty and (not partner_email or partner_data.empty):
    st.markdown("Add mood entries to see the pixel board.")
else:
    mood_map = {row["date"]: row["mood_category"] for _, row in data.iterrows() if row.get("mood_category")}

    now = date.today()
    month_col, year_col = st.columns(2)

    with month_col:
        month_choice = st.date_input("Monthly view", value=now.replace(day=1))
        z, hover_text, x_labels, y_labels = build_month_tracker_grid(month_choice.year, month_choice.month, mood_map)
        fig_month = mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Monthly Mood Grid")
        st.plotly_chart(fig_month, use_container_width=True)

    with year_col:
        year_choice = st.selectbox("Year", list(range(now.year - 3, now.year + 1)), index=3)
        z, hover_text, x_labels, y_labels = build_year_tracker_grid(year_choice, mood_map)
        fig_year = mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Yearly Mood Grid")
        st.plotly_chart(fig_year, use_container_width=True)

    if partner_email:
        st.markdown("<div class='small-label' style='margin-top:8px;'>Shared mood board (both users)</div>", unsafe_allow_html=True)
        shared_month = st.date_input(
            "Shared month",
            value=now.replace(day=1),
            key="shared_mood_month",
        )
        shared_year = st.selectbox(
            "Shared year",
            list(range(now.year - 3, now.year + 1)),
            index=3,
            key="shared_mood_year",
        )

        couple_entries = [
            (current_user_name, mood_map),
            (
                partner_name,
                {
                    row["date"]: row["mood_category"]
                    for _, row in partner_data.iterrows()
                    if row.get("mood_category")
                },
            ),
        ]

        month_pair_cols = st.columns(2)
        for idx, (name, user_mood_map) in enumerate(couple_entries):
            with month_pair_cols[idx]:
                z, hover_text, x_labels, y_labels = build_month_tracker_grid(
                    shared_month.year,
                    shared_month.month,
                    user_mood_map,
                )
                fig_shared_month = mood_heatmap(
                    z,
                    hover_text,
                    x_labels=x_labels,
                    y_labels=y_labels,
                    title=f"{name} • Monthly",
                )
                st.plotly_chart(fig_shared_month, use_container_width=True)

        year_pair_cols = st.columns(2)
        for idx, (name, user_mood_map) in enumerate(couple_entries):
            with year_pair_cols[idx]:
                z, hover_text, x_labels, y_labels = build_year_tracker_grid(
                    shared_year,
                    user_mood_map,
                )
                fig_shared_year = mood_heatmap(
                    z,
                    hover_text,
                    x_labels=x_labels,
                    y_labels=y_labels,
                    title=f"{name} • Yearly",
                )
                st.plotly_chart(fig_shared_year, use_container_width=True)

    legend = " • ".join([f"{m} ({MOOD_COLORS[m]})" for m in MOODS])
    st.caption("Mood colors: " + legend)

# --- MONTHLY STATISTICS ---

st.markdown("<div class='section-title'>Monthly Statistics</div>", unsafe_allow_html=True)

if data.empty:
    st.markdown("No monthly statistics available yet.")
else:
    today = date.today()
    monthly = data[(data["date"].apply(lambda d: d.year == today.year and d.month == today.month))]
    if monthly.empty:
        st.markdown("No entries for the current month yet.")
    else:
        stats_cols = st.columns(5)
        stats_cols[0].metric("Days logged", int(monthly.shape[0]))
        stats_cols[1].metric("Avg sleep", round(monthly["sleep_hours"].mean(), 1))
        stats_cols[2].metric("Avg anxiety", round(monthly["anxiety_level"].mean(), 1))
        stats_cols[3].metric("Avg work", round(monthly["work_hours"].mean(), 1))
        stats_cols[4].metric("Avg boredom", round(monthly["boredom_minutes"].mean(), 1))

        balance_avg = round(monthly["life_balance_score"].mean(), 1)
        habits_avg = round(monthly["habits_completed"].mean(), 1)
        extra_cols = st.columns(2)
        extra_cols[0].metric("Avg habits completed", habits_avg)
        extra_cols[1].metric("Avg balance", balance_avg)

        st.markdown("<div class='small-label' style='margin-top:8px;'>Life balance formula</div>", unsafe_allow_html=True)
        st.markdown("35% habits + 25% work + 25% sleep + 15% intentional boredom (10–40 min ideal).")
