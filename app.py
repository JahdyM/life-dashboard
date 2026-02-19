import os
import re
import html
import json
import base64
import mimetypes
from functools import lru_cache
from datetime import date, datetime, timedelta
import calendar
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from uuid import uuid4

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import requests
import streamlit as st
from sqlalchemy import bindparam, create_engine, inspect, text as sql_text
from sqlalchemy.exc import SQLAlchemyError

from dashboard.header import render_global_header
from dashboard.router import render_router
from dashboard.data import repositories
from dashboard.services import google_calendar

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
FIXED_COUPLE_HABIT_KEYS = {
    "bible_reading",
    "meeting_attended",
    "prepare_meeting",
    "workout",
    "shower",
}
DEFAULT_HABIT_LABELS = {key: label for key, label in HABITS}
CUSTOMIZABLE_HABIT_KEYS = [
    key for key, _ in HABITS if key not in FIXED_COUPLE_HABIT_KEYS
]
CUSTOM_HABITS_SETTING_KEY = "custom_habits"
CUSTOM_HABIT_DONE_PREFIX = "custom_habit_done::"

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
PROMPT_CARDS_TABLE = "partner_prompt_cards"
PROMPT_ANSWERS_TABLE = "partner_prompt_answers"
GOOGLE_TOKENS_TABLE = "google_calendar_tokens"

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

BACKGROUND_IMAGE_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), "assets", "background_academia_ultra.jpg"),
    os.path.join(os.path.dirname(__file__), "assets", "background_academia_optimized.jpg"),
    os.path.join(os.path.dirname(__file__), "assets", "background_academia.jpg"),
    os.path.join(os.path.dirname(__file__), "assets", "background_academia.jpeg"),
    os.path.join(os.path.dirname(__file__), "assets", "background_academia.png"),
    os.path.join(os.path.dirname(__file__), "assets", "background.jpg"),
    os.path.join(os.path.dirname(__file__), "assets", "background.png"),
]


st.set_page_config(page_title="Personal Life Dashboard", layout="wide")


@lru_cache(maxsize=16)
def file_path_to_data_uri(file_path):
    try:
        with open(file_path, "rb") as file_handle:
            payload = file_handle.read()
    except Exception:
        return ""
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "image/jpeg"
    encoded = base64.b64encode(payload).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def resolve_background_image_css_url():
    def read_secret_value(path):
        current = st.secrets
        for key in path:
            try:
                if key not in current:
                    return ""
                current = current[key]
            except Exception:
                return ""
        return str(current).strip() if current is not None else ""

    configured_path = (
        (os.getenv("DASHBOARD_BG_IMAGE_PATH") or "").strip()
        or read_secret_value(("DASHBOARD_BG_IMAGE_PATH",))
        or read_secret_value(("app", "DASHBOARD_BG_IMAGE_PATH"))
    )
    configured_url = (
        (os.getenv("DASHBOARD_BG_IMAGE_URL") or "").strip()
        or read_secret_value(("DASHBOARD_BG_IMAGE_URL",))
        or read_secret_value(("app", "DASHBOARD_BG_IMAGE_URL"))
    )
    if configured_path:
        configured_candidates = [configured_path]
        if not os.path.isabs(configured_path):
            configured_candidates.append(os.path.join(os.path.dirname(__file__), configured_path))
        for path_candidate in configured_candidates:
            if os.path.exists(path_candidate):
                return file_path_to_data_uri(path_candidate)
    if configured_url:
        return configured_url
    for candidate in BACKGROUND_IMAGE_CANDIDATES:
        if os.path.exists(candidate):
            return file_path_to_data_uri(candidate)
    return ""


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

THEME_PRESETS = {
    "dark": {
        "bg_main": "#121017",
        "bg_glow": "#1f1a2a",
        "bg_accent": "#1a1622",
        "bg_card": "#1e1a27",
        "bg_panel": "#2a2335",
        "border": "#5b4f70",
        "text_main": "#f3edf9",
        "text_soft": "#c8bbd8",
        "button": "#5f4f79",
        "button_hover": "#725f90",
        "accent_purple": "#8e79af",
        "plot_grid": "#3d3550",
        "plot_marker_line": "#ddd1ea",
        "overlay_start": "rgba(8, 6, 10, 0.84)",
        "overlay_end": "rgba(8, 6, 10, 0.9)",
        "popover_bg": "#201a2b",
        "popover_border": "#5b4f70",
        "popover_title": "#e7def4",
        "popover_text": "#d7cde8",
        "calendar_score_text": "#f1e9d9",
        "calendar_score_bg": "rgba(87, 73, 113, 0.55)",
        "calendar_score_border": "rgba(143, 182, 217, 0.35)",
        "calendar_score_empty_text": "#a89cb8",
        "calendar_score_empty_border": "rgba(159, 149, 173, 0.3)",
        "calendar_score_empty_bg": "rgba(36, 30, 48, 0.4)",
        "today_border": "#d9c979",
        "today_bg": "rgba(217, 201, 121, 0.12)",
    },
    "light": {
        "bg_main": "#f7f3ed",
        "bg_glow": "#eee2d3",
        "bg_accent": "#f4eee5",
        "bg_card": "#fff9f1",
        "bg_panel": "#f6efe3",
        "border": "#c4b59f",
        "text_main": "#2f2922",
        "text_soft": "#6c6053",
        "button": "#b29a7d",
        "button_hover": "#9f876b",
        "accent_purple": "#8f7aa9",
        "plot_grid": "#d9ccbb",
        "plot_marker_line": "#ffffff",
        "overlay_start": "rgba(255, 249, 239, 0.42)",
        "overlay_end": "rgba(244, 235, 221, 0.46)",
        "popover_bg": "#fff8ef",
        "popover_border": "#c4b59f",
        "popover_title": "#3f352c",
        "popover_text": "#5c5044",
        "calendar_score_text": "#3f352c",
        "calendar_score_bg": "rgba(226, 214, 197, 0.78)",
        "calendar_score_border": "rgba(160, 140, 115, 0.45)",
        "calendar_score_empty_text": "#7e7265",
        "calendar_score_empty_border": "rgba(160, 140, 115, 0.3)",
        "calendar_score_empty_bg": "rgba(233, 223, 210, 0.65)",
        "today_border": "#9b845f",
        "today_bg": "rgba(203, 184, 154, 0.32)",
    },
}

if "ui_theme" not in st.session_state:
    st.session_state["ui_theme"] = "dark"
if st.session_state["ui_theme"] not in THEME_PRESETS:
    st.session_state["ui_theme"] = "dark"

ACTIVE_THEME_NAME = st.session_state["ui_theme"]
ACTIVE_THEME = THEME_PRESETS[ACTIVE_THEME_NAME]
THEME_TOGGLE_ICON = "☀️" if ACTIVE_THEME_NAME == "dark" else "🌙"
THEME_TOGGLE_HELP = "Switch to light mode" if ACTIVE_THEME_NAME == "dark" else "Switch to dark mode"

theme_vars_css = f"""
:root {{
    --bg-main: {ACTIVE_THEME['bg_main']};
    --bg-glow: {ACTIVE_THEME['bg_glow']};
    --bg-accent: {ACTIVE_THEME['bg_accent']};
    --bg-card: {ACTIVE_THEME['bg_card']};
    --bg-panel: {ACTIVE_THEME['bg_panel']};
    --border: {ACTIVE_THEME['border']};
    --text-main: {ACTIVE_THEME['text_main']};
    --text-soft: {ACTIVE_THEME['text_soft']};
    --button: {ACTIVE_THEME['button']};
    --button-hover: {ACTIVE_THEME['button_hover']};
    --accent-purple: {ACTIVE_THEME['accent_purple']};
    --plot-grid: {ACTIVE_THEME['plot_grid']};
    --plot-marker-line: {ACTIVE_THEME['plot_marker_line']};
    --overlay-start: {ACTIVE_THEME['overlay_start']};
    --overlay-end: {ACTIVE_THEME['overlay_end']};
    --popover-bg: {ACTIVE_THEME['popover_bg']};
    --popover-border: {ACTIVE_THEME['popover_border']};
    --popover-title: {ACTIVE_THEME['popover_title']};
    --popover-text: {ACTIVE_THEME['popover_text']};
    --calendar-score-text: {ACTIVE_THEME['calendar_score_text']};
    --calendar-score-bg: {ACTIVE_THEME['calendar_score_bg']};
    --calendar-score-border: {ACTIVE_THEME['calendar_score_border']};
    --calendar-score-empty-text: {ACTIVE_THEME['calendar_score_empty_text']};
    --calendar-score-empty-border: {ACTIVE_THEME['calendar_score_empty_border']};
    --calendar-score-empty-bg: {ACTIVE_THEME['calendar_score_empty_bg']};
    --today-border: {ACTIVE_THEME['today_border']};
    --today-bg: {ACTIVE_THEME['today_bg']};
    --atom-cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.8'%3E%3Cellipse cx='14' cy='14' rx='10' ry='4.8'/%3E%3Cellipse cx='14' cy='14' rx='10' ry='4.8' transform='rotate(60 14 14)'/%3E%3Cellipse cx='14' cy='14' rx='10' ry='4.8' transform='rotate(-60 14 14)'/%3E%3C/g%3E%3Ccircle cx='14' cy='14' r='2.6' fill='%23000000' stroke='%23ffffff' stroke-width='1.1'/%3E%3C/svg%3E") 14 14, auto;
}}
"""

st.markdown(
    """
<style>
@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
"""
    + theme_vars_css
    + """

html, body, [class*="css"] {
    font-family: 'IBM Plex Sans', sans-serif;
    color: var(--text-main);
}

html, body, .stApp, .stApp * {
    cursor: var(--atom-cursor) !important;
}

h1, h2, h3, .page-title {
    font-family: 'Crimson Text', serif;
    letter-spacing: 0.4px;
}

.stApp {
    background: radial-gradient(1400px 900px at 20% 0%, var(--bg-glow) 0%, var(--bg-main) 58%);
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

button[kind="tertiary"] {
    background: transparent !important;
    border: 1px solid rgba(157, 145, 177, 0.28) !important;
    color: #f2edf8 !important;
    border-radius: 8px !important;
    min-height: 22px !important;
    height: 22px !important;
    width: 22px !important;
    padding: 0 !important;
    font-size: 11px !important;
    line-height: 1 !important;
    opacity: 0;
    transition: opacity 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

div[data-testid="stHorizontalBlock"]:hover button[kind="tertiary"],
button[kind="tertiary"]:focus-visible,
button[kind="tertiary"]:hover {
    opacity: 1;
}

button[kind="tertiary"]:hover {
    background: rgba(114, 95, 144, 0.32) !important;
    border-color: #a892c4 !important;
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
    position: relative;
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

.calendar-cell.today {
    border-color: var(--today-border);
    box-shadow: inset 0 0 0 1px var(--today-border);
    background: var(--today-bg);
}

.calendar-day {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 6px;
}

.calendar-score {
    margin-top: 5px;
    display: inline-block;
    font-size: 10px;
    color: var(--calendar-score-text);
    background: var(--calendar-score-bg);
    border: 1px solid var(--calendar-score-border);
    border-radius: 999px;
    padding: 1px 6px;
}

.calendar-score.empty {
    color: var(--calendar-score-empty-text);
    border-color: var(--calendar-score-empty-border);
    background: var(--calendar-score-empty-bg);
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

.cal-popover {
    position: relative;
    display: inline-block;
}

.cal-popover-panel {
    display: none;
    position: absolute;
    left: 0;
    top: calc(100% + 6px);
    min-width: 220px;
    max-width: 280px;
    background: var(--popover-bg);
    border: 1px solid var(--popover-border);
    border-radius: 10px;
    padding: 8px 10px;
    box-shadow: 0 12px 22px rgba(0,0,0,0.42);
    z-index: 100;
}

.cal-popover:hover .cal-popover-panel,
.cal-popover:focus-within .cal-popover-panel {
    display: block;
}

.cal-popover-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--popover-title);
    margin-bottom: 4px;
}

.cal-popover-panel ul {
    margin: 0;
    padding-left: 16px;
}

.cal-popover-panel li {
    font-size: 11px;
    color: var(--popover-text);
    line-height: 1.35;
    margin-bottom: 2px;
}

.calendar-table td:last-child .cal-popover-panel {
    left: auto;
    right: 0;
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

background_image_css_url = resolve_background_image_css_url()
if background_image_css_url:
    safe_background_url = background_image_css_url.replace("'", "%27")
    st.markdown(
        f"""
<style>
html, body {{
    background-image:
        linear-gradient(var(--overlay-start), var(--overlay-end)),
        url('{safe_background_url}') !important;
    background-size: cover !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
    background-attachment: fixed !important;
}}

.stApp {{
    background: transparent !important;
}}

div[data-testid="stAppViewContainer"] {{
    background: transparent !important;
}}

div[data-testid="stAppViewContainer"] > .main,
div[data-testid="stAppViewContainer"] [data-testid="stAppViewBlockContainer"] {{
    background: transparent !important;
}}
</style>
""",
        unsafe_allow_html=True,
    )


title_cols = st.columns([16, 1])
with title_cols[0]:
    st.markdown("<div class='page-title' style='font-size:30px;'>Personal Life Dashboard</div>", unsafe_allow_html=True)
with title_cols[1]:
    if st.button(THEME_TOGGLE_ICON, key="toggle_theme_mode", help=THEME_TOGGLE_HELP):
        st.session_state["ui_theme"] = "light" if ACTIVE_THEME_NAME == "dark" else "dark"
        st.rerun()


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
    raw_value = (
        get_secret(("database", "url"))
        or get_secret(("DATABASE_URL",))
        or os.getenv("DATABASE_URL")
        or ""
    )
    database_url = normalize_database_url(str(raw_value).strip())
    if database_url and database_url.lower() not in {"none", "null"}:
        return database_url
    return f"sqlite:///{DB_PATH}"


def normalize_database_url(database_url):
    url = str(database_url or "").strip()
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://") :]

    # Avoid incompatibility in some hosted runtimes/libpq versions.
    try:
        parsed = urlparse(url)
        if "channel_binding=" in (parsed.query or ""):
            query_items = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k != "channel_binding"]
            parsed = parsed._replace(query=urlencode(query_items))
            url = urlunparse(parsed)
    except Exception:
        return url
    return url


def using_local_sqlite(database_url):
    return str(database_url).strip().lower().startswith("sqlite")


def describe_database_target(database_url):
    url = str(database_url or "").strip()
    if using_local_sqlite(url):
        return "sqlite:///life_dashboard.db (local file)"
    if not url:
        return "(empty)"
    parsed = urlparse(url)
    host = parsed.hostname or "unknown-host"
    port = f":{parsed.port}" if parsed.port else ""
    db_name = parsed.path.lstrip("/") or "database"
    return f"{parsed.scheme}://{host}{port}/{db_name}"


def show_database_connection_error(exc):
    db_url = get_database_url()
    placeholder_tokens = ["USER", "PASSWORD", "HOST", "DBNAME", "host:5432/DBNAME"]
    has_placeholder = any(token in str(db_url) for token in placeholder_tokens)
    st.error("Database connection failed.")
    st.markdown(
        "I could not connect to your configured database target:\n"
        f"`{describe_database_target(db_url)}`"
    )
    if has_placeholder:
        st.warning(
            "Your database URL still contains template placeholders. Replace USER, PASSWORD, HOST, and DBNAME "
            "with real values from Neon/Supabase."
        )
    st.markdown(
        "Check `Settings -> Secrets` and make sure `[database].url` is valid and active.\n"
        "Use this format:"
    )
    st.code(
        "[database]\n"
        "url = \"postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require\"",
        language="toml",
    )
    st.caption(f"Technical detail: {type(exc).__name__}")
    st.stop()


def running_on_streamlit_cloud():
    redirect_uri = str(get_secret(("auth", "redirect_uri")) or "").strip().lower()
    return ".streamlit.app/" in redirect_uri


def enforce_persistent_storage_on_cloud():
    database_url = get_database_url()
    if running_on_streamlit_cloud() and using_local_sqlite(database_url):
        st.error(
            "Persistent storage is required. This app is currently using temporary SQLite and "
            "new entries can be lost after reboot."
        )
        st.markdown(
            "Set this in Streamlit Cloud Secrets and reboot once:\n\n"
            "```toml\n"
            "[database]\n"
            "url = \"postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require\"\n"
            "```"
        )
        st.stop()


def render_data_persistence_notice(storage_message=None):
    if storage_message:
        st.caption(storage_message)


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
            "redirect_uri = \"https://jahdy-gui-dashboard.streamlit.app/oauth2callback\"\n"
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
            "/oauth2callback (example: https://jahdy-gui-dashboard.streamlit.app/oauth2callback)."
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
    invalidate_runtime_caches()


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
    invalidate_runtime_caches()
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
    invalidate_runtime_caches()


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


def sanitize_habit_name(raw_value):
    return " ".join(str(raw_value or "").split()).strip()[:60]


def default_custom_habits():
    return [
        {"id": f"legacy_{key}", "name": DEFAULT_HABIT_LABELS[key], "active": True}
        for key in CUSTOMIZABLE_HABIT_KEYS
    ]


def get_custom_habits(active_only=True):
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


@st.cache_data(ttl=45, show_spinner=False)
def load_custom_habit_done_by_date_cached(user_email, database_url):
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
            if sanitize_habit_name(habit_id)
        }
    return done_by_date


def load_custom_habit_done_by_date():
    return load_custom_habit_done_by_date_cached(
        get_current_user_email(),
        get_database_url(),
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


def normalize_entries_df(df):
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


@st.cache_data(ttl=45, show_spinner=False)
def load_data_for_email_cached(user_email, database_url):
    engine = get_engine(database_url)
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


def load_data_for_email(user_email):
    return load_data_for_email_cached(user_email, get_database_url())


def load_data():
    return load_data_for_email(get_current_user_email())


@st.cache_data(ttl=30, show_spinner=False)
def load_today_activities_cached(user_email, day_iso):
    return repositories.list_activities_for_day(user_email, date.fromisoformat(day_iso))


@st.cache_data(ttl=30, show_spinner=False)
def load_shared_snapshot_cached(day_iso, user_a, user_b, habit_keys):
    return repositories.get_shared_habit_comparison(
        date.fromisoformat(day_iso),
        user_a,
        user_b,
        list(habit_keys),
    )


def invalidate_runtime_caches():
    load_data_for_email_cached.clear()
    load_custom_habit_done_by_date_cached.clear()
    list_todo_tasks_for_window_cached.clear()
    load_today_activities_cached.clear()
    load_shared_snapshot_cached.clear()


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
    invalidate_runtime_caches()
    return payload["id"]


@st.cache_data(ttl=30, show_spinner=False)
def list_todo_tasks_for_window_cached(user_email, database_url, week_start_iso, week_end_iso, selected_iso):
    engine = get_engine(database_url)
    with engine.connect() as conn:
        rows = conn.execute(
            sql_text(
                f"""
                SELECT
                    id, user_email, title, source, external_event_key, scheduled_date, scheduled_time,
                    priority_tag, estimated_minutes, actual_minutes, is_done, created_at
                FROM {TASKS_TABLE}
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
    invalidate_runtime_caches()


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
    invalidate_runtime_caches()


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
    invalidate_runtime_caches()


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
    invalidate_runtime_caches()
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
    invalidate_runtime_caches()
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
    invalidate_runtime_caches()
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
    invalidate_runtime_caches()


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
    invalidate_runtime_caches()
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


@st.cache_data(ttl=900, show_spinner=False)
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


def month_last_day(reference_date):
    days = calendar.monthrange(reference_date.year, reference_date.month)[1]
    return reference_date.replace(day=days)


def build_badge_popover(label, count, css_kind, details_text):
    lines = [line.strip() for line in str(details_text or "").split("\n") if line.strip()]
    if not lines:
        lines = [f"{label} {count}"]
    heading = "Google events" if css_kind == "google" else "Tasks"
    items_html = "".join([f"<li>{html.escape(line)}</li>" for line in lines])
    return (
        f"<span class='cal-popover cal-popover-{css_kind}'>"
        f"<span class='cal-badge cal-{css_kind}'>{label} {count}</span>"
        f"<div class='cal-popover-panel'>"
        f"<div class='cal-popover-title'>{heading}</div>"
        f"<ul>{items_html}</ul>"
        "</div>"
        "</span>"
    )


def build_week_calendar_html(
    week_start,
    selected_date,
    google_counts,
    task_counts,
    google_details,
    task_details,
    score_map,
):
    days = [week_start + timedelta(days=offset) for offset in range(7)]
    today_date = date.today()
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
        classes = ["calendar-cell"]
        if day == selected_date:
            classes.append("selected")
        if day == today_date:
            classes.append("today")
        badges = []
        if google_count:
            badges.append(
                build_badge_popover("G", google_count, "google", google_details.get(day, ""))
            )
        if task_count:
            badges.append(
                build_badge_popover("T", task_count, "task", task_details.get(day, ""))
            )
        if not badges:
            badges.append("<span class='cal-badge cal-none'>-</span>")
        day_score = score_map.get(day)
        if day_score is None:
            score_html = "<div class='calendar-score empty'>Score -</div>"
        else:
            score_html = f"<div class='calendar-score'>Score {int(round(day_score))}</div>"
        cells.append(
            (
                f"<td class='{' '.join(classes)}'>"
                f"<div class='calendar-day'>{day.day}</div>"
                f"<div class='calendar-badges'>{''.join(badges)}</div>"
                f"{score_html}"
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
    invalidate_runtime_caches()


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
    invalidate_runtime_caches()


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


def streak_count(data, habit_key, today, valid_weekdays=None):
    if data.empty:
        return 0
    habit_map = {row["date"]: int(row.get(habit_key, 0)) for _, row in data.iterrows()}
    if not habit_map:
        return 0
    min_date = min(habit_map.keys())
    allowed_days = set(valid_weekdays) if valid_weekdays is not None else None
    count = 0
    current = today
    while current >= min_date:
        if allowed_days is not None and current.weekday() not in allowed_days:
            current -= timedelta(days=1)
            continue
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


def compute_habits_metrics(row, meeting_days, custom_done_by_date, custom_habit_ids):
    total = 0
    completed = 0
    weekday = row["date"].weekday()
    for key, _ in HABITS:
        if key not in FIXED_COUPLE_HABIT_KEYS:
            continue
        if key in MEETING_HABIT_KEYS and weekday not in meeting_days:
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


def apply_common_plot_style(fig, title, show_xgrid=True, show_ygrid=True):
    fig.update_layout(
        title=title,
        title_font=dict(color=ACTIVE_THEME["text_main"], size=16, family="Crimson Text"),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=ACTIVE_THEME["text_main"], family="IBM Plex Sans"),
        margin=dict(l=40, r=20, t=40, b=30),
        xaxis=dict(
            showgrid=show_xgrid,
            gridcolor=ACTIVE_THEME["plot_grid"],
            tickfont=dict(color=ACTIVE_THEME["text_soft"]),
            zeroline=False,
            showline=True,
            linecolor=ACTIVE_THEME["border"],
            mirror=True,
        ),
        yaxis=dict(
            showgrid=show_ygrid,
            gridcolor=ACTIVE_THEME["plot_grid"],
            zeroline=False,
            tickfont=dict(color=ACTIVE_THEME["text_soft"]),
            showline=True,
            linecolor=ACTIVE_THEME["border"],
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
        title_font=dict(color=ACTIVE_THEME["text_main"], size=16, family="Crimson Text"),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=ACTIVE_THEME["text_main"], family="IBM Plex Sans"),
        margin=dict(l=20, r=20, t=40, b=20),
        xaxis=dict(
            showgrid=False,
            zeroline=False,
            tickfont=dict(color=ACTIVE_THEME["text_soft"], size=11),
            tickmode="array",
            tickvals=list(range(len(x_labels))),
            ticktext=x_labels,
            side="top",
            showline=True,
            linecolor=ACTIVE_THEME["border"],
            mirror=True,
        ),
        yaxis=dict(
            showgrid=False,
            zeroline=False,
            tickmode="array",
            tickvals=list(range(len(y_labels))),
            ticktext=y_labels,
            autorange="reversed",
            tickfont=dict(color=ACTIVE_THEME["text_soft"], size=10),
            showline=True,
            linecolor=ACTIVE_THEME["border"],
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
            marker=dict(size=8, color=color, line=dict(width=1, color=ACTIVE_THEME["plot_marker_line"])),
        )
    )
    apply_common_plot_style(fig, title, show_xgrid=True, show_ygrid=True)
    fig.update_layout(height=height)
    fig.update_yaxes(categoryorder="array", categoryarray=list(dates), automargin=True)
    fig.update_xaxes(tickfont=dict(size=10, color=ACTIVE_THEME["text_soft"]))
    return fig


enforce_google_login()
enforce_persistent_storage_on_cloud()
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
aesthetic_image_urls = get_aesthetic_image_urls(tuple(PINTEREST_MOOD_LINKS))

meeting_days = get_meeting_days()
if "meeting_days" not in st.session_state:
    st.session_state["meeting_days"] = meeting_days
meeting_days = st.session_state["meeting_days"]

active_tab = st.session_state.get("ui.active_tab", "Daily Habits")
tabs_needing_data = {"Daily Habits", "Statistics & Charts", "Mood Board"}
data = load_data() if active_tab in tabs_needing_data else pd.DataFrame(columns=ENTRY_COLUMNS)

if active_tab == "Statistics & Charts" and not data.empty:
    custom_habits = get_custom_habits(active_only=True)
    custom_habit_ids = [habit["id"] for habit in custom_habits]
    custom_done_by_date = load_custom_habit_done_by_date()
    metrics = data.apply(
        lambda row: compute_habits_metrics(
            row,
            meeting_days,
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
repositories.configure(
    get_engine,
    get_database_url,
    get_current_user_email,
    invalidate_callback=invalidate_runtime_caches,
    secret_getter=get_secret,
)
google_calendar.configure(get_secret)
repositories.set_google_delete_callback(google_calendar.delete_event)

today_activities = load_today_activities_cached(current_user_email, date.today().isoformat())
pending_tasks = sum(1 for row in today_activities if int(row.get("is_done", 0) or 0) == 0)
shared_habit_keys = ["bible_reading", "meeting_attended", "prepare_meeting", "workout", "shower"]
shared_snapshot = {}
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

render_global_header(
    {
        "shared_snapshot": shared_snapshot,
        "current_user_name": current_user_name,
        "partner_name": partner_name,
        "habit_labels": DEFAULT_HABIT_LABELS,
    }
)

context = {
    "current_user_email": current_user_email,
    "current_user_name": current_user_name,
    "partner_email": partner_email,
    "partner_name": partner_name,
    "data": data,
    "meeting_days": meeting_days,
    "quick_indicators": {"pending_tasks": pending_tasks},
    "constants": {
        "DAY_LABELS": DAY_LABELS,
        "DAY_TO_INDEX": DAY_TO_INDEX,
        "DEFAULT_HABIT_LABELS": DEFAULT_HABIT_LABELS,
        "FIXED_COUPLE_HABIT_KEYS": FIXED_COUPLE_HABIT_KEYS,
        "MEETING_HABIT_KEYS": MEETING_HABIT_KEYS,
        "MOODS": MOODS,
        "JAHDY_EMAIL": JAHDY_EMAIL,
        "GUILHERME_EMAIL": GUILHERME_EMAIL,
    },
    "helpers": {
        "get_secret": get_secret,
        "get_user_calendar_ics_url": get_user_calendar_ics_url,
        "fetch_ics_events_for_range": fetch_ics_events_for_range,
        "filter_events_for_date": filter_events_for_date,
        "build_event_count_map": build_event_count_map,
        "build_event_detail_map": build_event_detail_map,
        "build_task_count_map": build_task_count_map,
        "build_task_detail_map": build_task_detail_map,
        "build_week_calendar_html": build_week_calendar_html,
        "get_week_range": get_week_range,
        "month_last_day": month_last_day,
        "dot_chart": dot_chart,
        "mood_heatmap": mood_heatmap,
        "build_month_tracker_grid": build_month_tracker_grid,
        "build_year_tracker_grid": build_year_tracker_grid,
        "streak_count": streak_count,
    },
}

render_router(context)
st.stop()
