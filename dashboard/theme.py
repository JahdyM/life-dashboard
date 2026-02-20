import os
import base64
import mimetypes
from functools import lru_cache

import streamlit as st

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
        "calendar_panel": "rgba(24, 20, 32, 0.55)",
        "calendar_panel_border": "rgba(91, 79, 112, 0.55)",
        "row_hover": "rgba(255, 255, 255, 0.04)",
        "divider": "rgba(255,255,255,0.08)",
    },
    "light": {
        "bg_main": "#f7f3ed",
        "bg_glow": "#eee2d3",
        "bg_accent": "#f4eee5",
        "bg_card": "#fff9f1",
        "bg_panel": "#f6efe3",
        "border": "#c4b59f",
        "text_main": "#1b1b1b",
        "text_soft": "#5d5d5d",
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
        "calendar_panel": "rgba(255, 248, 238, 0.88)",
        "calendar_panel_border": "rgba(196, 181, 159, 0.75)",
        "row_hover": "rgba(45, 36, 27, 0.06)",
        "divider": "rgba(0,0,0,0.08)",
    },
}

BACKGROUND_IMAGE_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), "..", "assets", "background_academia_ultra.jpg"),
    os.path.join(os.path.dirname(__file__), "..", "assets", "background_academia_optimized.jpg"),
    os.path.join(os.path.dirname(__file__), "..", "assets", "background_academia.jpg"),
    os.path.join(os.path.dirname(__file__), "..", "assets", "background_academia.jpeg"),
    os.path.join(os.path.dirname(__file__), "..", "assets", "background.jpg"),
    os.path.join(os.path.dirname(__file__), "..", "assets", "background.png"),
]


def ensure_theme_state():
    if "ui_theme" not in st.session_state:
        st.session_state["ui_theme"] = "dark"
    if st.session_state["ui_theme"] not in THEME_PRESETS:
        st.session_state["ui_theme"] = "dark"
    return st.session_state["ui_theme"]


def get_active_theme():
    name = ensure_theme_state()
    return name, THEME_PRESETS[name]


@lru_cache(maxsize=16)
def file_path_to_data_uri(file_path: str) -> str:
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


def resolve_background_image_css_url() -> str:
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
            configured_candidates.append(os.path.join(os.path.dirname(__file__), "..", configured_path))
        for path_candidate in configured_candidates:
            if os.path.exists(path_candidate):
                return file_path_to_data_uri(path_candidate)
    if configured_url:
        return configured_url
    for candidate in BACKGROUND_IMAGE_CANDIDATES:
        candidate = os.path.abspath(candidate)
        if os.path.exists(candidate):
            return file_path_to_data_uri(candidate)
    return ""


def inject_theme_css() -> dict:
    active_name, active_theme = get_active_theme()
    theme_toggle_icon = "☀️" if active_name == "dark" else "🌙"
    theme_toggle_help = "Switch to light mode" if active_name == "dark" else "Switch to dark mode"

    theme_vars_css = f"""
:root {{
    --bg-main: {active_theme['bg_main']};
    --bg-glow: {active_theme['bg_glow']};
    --bg-accent: {active_theme['bg_accent']};
    --bg-card: {active_theme['bg_card']};
    --bg-panel: {active_theme['bg_panel']};
    --border: {active_theme['border']};
    --text-main: {active_theme['text_main']};
    --text-soft: {active_theme['text_soft']};
    --button: {active_theme['button']};
    --button-hover: {active_theme['button_hover']};
    --accent-purple: {active_theme['accent_purple']};
    --plot-grid: {active_theme['plot_grid']};
    --plot-marker-line: {active_theme['plot_marker_line']};
    --overlay-start: {active_theme['overlay_start']};
    --overlay-end: {active_theme['overlay_end']};
    --popover-bg: {active_theme['popover_bg']};
    --popover-border: {active_theme['popover_border']};
    --popover-title: {active_theme['popover_title']};
    --popover-text: {active_theme['popover_text']};
    --calendar-score-text: {active_theme['calendar_score_text']};
    --calendar-score-bg: {active_theme['calendar_score_bg']};
    --calendar-score-border: {active_theme['calendar_score_border']};
    --calendar-score-empty-text: {active_theme['calendar_score_empty_text']};
    --calendar-score-empty-border: {active_theme['calendar_score_empty_border']};
    --calendar-score-empty-bg: {active_theme['calendar_score_empty_bg']};
    --today-border: {active_theme['today_border']};
    --today-bg: {active_theme['today_bg']};
    --calendar-panel: {active_theme['calendar_panel']};
    --calendar-panel-border: {active_theme['calendar_panel_border']};
    --row-hover: {active_theme['row_hover']};
    --divider: {active_theme['divider']};
    --atom-cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.8'%3E%3Cellipse cx='14' cy='14' rx='10' ry='4.8'/%3E%3Cellipse cx='14' cy='14' rx='10' ry='4.8' transform='rotate(60 14 14)'/%3E%3Cellipse cx='14' cy='14' rx='10' ry='4.8' transform='rotate(-60 14 14)'/%3E%3C/g%3E%3Ccircle cx='14' cy='14' r='2.6' fill='%23000000' stroke='%23ffffff' stroke-width='1.1'/%3E%3C/svg%3E") 14 14, auto;
}}
"""

    st.markdown(
        """
<style>
@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');
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
    font-size: 14px;
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
    font-size: 12px;
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
    background: transparent !important;
    color: var(--text-main) !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    font-weight: 500;
    box-shadow: none !important;
    min-height: unset !important;
}

.stButton>button:hover {
    background: transparent !important;
    border-color: transparent !important;
}

.stButton>button[kind="primary"] {
    background: var(--button) !important;
    color: #f6f0ff !important;
    border: 1px solid #7d6a98 !important;
    border-radius: 10px !important;
    padding: 6px 12px !important;
    min-height: 32px !important;
}

.stButton>button[kind="primary"]:hover {
    background: var(--button-hover) !important;
    border-color: #9583b1 !important;
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

.calendar-compact [data-testid="stVerticalBlock"] > div {
    padding-top: 0.08rem;
    padding-bottom: 0.08rem;
}

.calendar-compact [data-testid="stHorizontalBlock"] {
    gap: 0.35rem;
}

.calendar-compact .stMarkdown p {
    margin: 0.05rem 0;
}

.calendar-compact hr {
    margin: 0.12rem 0;
}

.calendar-compact .stExpander {
    margin-top: 0.1rem;
    margin-bottom: 0.1rem;
}

.calendar-compact .stExpander > div:first-child {
    padding-top: 0.15rem;
    padding-bottom: 0.15rem;
}

.calendar-compact .stExpander > div:last-child {
    padding-top: 0.2rem;
    padding-bottom: 0.2rem;
}

.calendar-compact .stTextInput > div > div input,
.calendar-compact .stNumberInput input,
.calendar-compact .stTimeInput input {
    padding-top: 0.12rem;
    padding-bottom: 0.12rem;
    min-height: 32px;
}

.calendar-compact .stButton > button {
    padding: 0.18rem 0.35rem;
    min-height: 32px;
}

.calendar-compact .stCaption {
    margin-top: 0.02rem;
    margin-bottom: 0.02rem;
}

.calendar-compact .task-title-btn button {
    width: 100%;
    text-align: left;
    background: transparent !important;
    color: var(--text-main);
    border: none !important;
    box-shadow: none !important;
    border-radius: 6px;
    padding: 0 !important;
    min-height: 22px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.calendar-compact .task-title-btn button:hover {
    background: transparent;
}

.calendar-compact .stButton > button,
.calendar-compact .stButton > button:hover,
.calendar-compact .stButton > button:active,
.calendar-compact .stButton > button:focus {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    color: var(--text-main) !important;
}

.calendar-compact .task-details {
    background: var(--bg-card);
    border: 1px solid var(--divider);
    border-radius: 10px;
    padding: 0.35rem 0.55rem;
    margin: 0.1rem 0 0.2rem 1.0rem;
    transition: all 140ms ease-out;
}

.calendar-card {
    background: var(--calendar-panel);
    border: 1px solid var(--divider);
    border-radius: 12px;
    padding: 0.4rem 0.5rem;
    backdrop-filter: blur(6px);
}

.task-list [data-testid="stHorizontalBlock"] {
    padding: 0.06rem 0.04rem;
    margin-bottom: 0;
    min-height: 32px;
    border-bottom: 1px solid var(--divider);
    align-items: center;
    gap: 6px;
}

.task-list [data-testid="stHorizontalBlock"] > div {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
}


.task-list [data-testid="stHorizontalBlock"]:last-child {
    border-bottom: none;
}

.task-list [data-testid="stCheckbox"] {
    margin-top: 2px;
}

.task-list [data-testid="stHorizontalBlock"]:hover {
    background: transparent;
    border-radius: 0;
}

.task-list [data-testid="stButton"] {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}

.task-list [data-testid="stButton"] > button,
.task-list button {
    all: unset !important;
    display: block;
    width: 100%;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-main) !important;
    letter-spacing: 0.2px;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
}

.task-list .task-title-btn,
.task-list .task-title-btn button {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
}

.task-list button,
.task-list button:hover,
.task-list button:active,
.task-list button:focus {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    outline: none !important;
}

.task-list [data-testid="stButton"] > button:hover {
    text-decoration: none;
}

.task-list [data-testid="stButton"] > button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}

.task-time {
    font-size: 0.74rem;
    color: var(--text-soft);
    text-align: right;
    padding-right: 0.1rem;
    min-width: 52px;
}

.calendar-hacker {
    background: rgba(0, 0, 0, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 0.45rem 0.55rem;
    font-family: "IBM Plex Mono", monospace;
    color: #f2f2f2;
}

.calendar-hacker .calendar-section-title {
    color: #f5f5f5;
    font-family: "IBM Plex Mono", monospace;
    letter-spacing: 0.1em;
}

.calendar-hacker .task-title-btn button {
    font-family: "IBM Plex Mono", monospace;
    color: #f2f2f2 !important;
}

.calendar-hacker .task-time {
    color: #7cfc8a;
}

.calendar-hacker [data-testid="stHorizontalBlock"] {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.calendar-card {
    background: rgba(0, 0, 0, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 0.4rem 0.5rem;
    backdrop-filter: blur(6px);
}

.calendar-card .fc {
    font-family: "IBM Plex Mono", monospace;
    font-size: 12px;
    color: #f2f2f2;
}

.calendar-card .fc .fc-toolbar-title {
    font-size: 0.8rem;
    font-weight: 600;
}

.calendar-card .fc .fc-button {
    padding: 0.12rem 0.3rem;
    font-size: 0.68rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: #f2f2f2;
}

.calendar-card .fc .fc-scrollgrid,
.calendar-card .fc .fc-scrollgrid-section,
.calendar-card .fc .fc-timegrid-divider,
.calendar-card .fc .fc-timegrid-slot {
    border-color: rgba(255, 255, 255, 0.06) !important;
}

.calendar-card .fc .fc-timegrid-slot {
    height: 28px;
}

.calendar-card .fc .fc-event {
    background: rgba(30, 140, 80, 0.35) !important;
    border: 1px solid rgba(124, 252, 138, 0.6) !important;
    color: #eafff3 !important;
    border-radius: 6px;
    padding: 1px 4px;
    font-size: 11px;
}

.task-list .stButton > button:hover {
    background: transparent;
}

.subtask-list {
    margin-left: 0.9rem;
    padding-left: 0.6rem;
    border-left: 1px solid var(--divider);
}

.subtask-list [data-testid="stHorizontalBlock"] {
    padding: 0.06rem 0.08rem;
}

.task-time {
    font-size: 0.7rem;
    color: var(--text-soft);
    text-align: right;
    padding-right: 0.1rem;
}

.task-details .stButton > button {
    border: none !important;
    background: transparent !important;
    color: var(--text-soft) !important;
    padding: 0 !important;
    min-height: 20px !important;
}

.task-details .stButton > button:hover {
    text-decoration: underline;
    background: transparent !important;
}

#cursor-trail-container {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
}

.cursor-trail {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.55);
    animation: trailFade 0.6s ease-out forwards;
}

@keyframes trailFade {
    0% { opacity: 0.8; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.2); }
}

.calendar-card .fc {
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 12px;
    color: var(--text-main);
}

.calendar-card .fc .fc-toolbar-title {
    font-size: 0.85rem;
    font-weight: 600;
}

.calendar-card .fc .fc-button {
    padding: 0.12rem 0.3rem;
    font-size: 0.68rem;
    border-radius: 8px;
    border: 1px solid var(--divider);
    background: transparent;
    color: var(--text-main);
}

.calendar-card .fc .fc-scrollgrid,
.calendar-card .fc .fc-scrollgrid-section,
.calendar-card .fc .fc-timegrid-divider {
    border-color: var(--divider) !important;
}

.calendar-card .fc .fc-timegrid-slot {
    height: 28px;
}

.calendar-card .fc .fc-timegrid-axis {
    font-size: 11px;
    color: var(--text-soft);
}

.calendar-card .fc .fc-timegrid-slot-label {
    font-size: 11px;
    color: var(--text-soft);
}

.calendar-card .fc .fc-event {
    border: 1px solid var(--divider);
    border-radius: 6px;
    padding: 1px 4px;
    font-size: 11px;
}

.calendar-top [data-testid="stHorizontalBlock"] {
    gap: 0.6rem;
}

.calendar-top .stSelectbox,
.calendar-top .stDateInput,
.calendar-top .stTextInput {
    min-height: 32px;
}

.calendar-top label {
    font-size: 0.72rem !important;
}
}

.calendar-top [data-testid="stHorizontalBlock"] {
    gap: 0.25rem;
}

.calendar-top .stSelectbox,
.calendar-top .stDateInput {
    min-height: 30px;
}

.calendar-top label {
    font-size: 0.72rem !important;
}

.day-grid {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
}

.day-row {
    display: grid;
    grid-template-columns: 58px 1fr;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    min-height: 28px;
}

.day-row:first-child {
    border-top: none;
}

.day-hour {
    font-size: 0.72rem;
    color: var(--text-soft);
    padding: 0.2rem 0.4rem;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.day-slot {
    font-size: 0.78rem;
    color: var(--text-strong);
    padding: 0.15rem 0.5rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.calendar-section-title {
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0.4rem 0 0.2rem 0;
}

.habits-compact [data-testid="stHorizontalBlock"] {
    gap: 0.2rem;
}

.habits-compact .stMarkdown p {
    margin: 0.05rem 0;
}

.habits-compact [data-testid="stCheckbox"] {
    margin-top: -2px;
}

.habits-compact .stButton > button {
    font-size: 0.75rem;
    padding: 0.1rem 0.25rem;
    min-height: 24px;
}

.habits-tight [data-testid="stVerticalBlock"] > div {
    padding-top: 0.1rem;
    padding-bottom: 0.1rem;
}

.habits-tight [data-testid="stHorizontalBlock"] {
    gap: 0.2rem;
}

.habits-tight .stMarkdown p {
    margin: 0.05rem 0;
}

.panel {
    background: rgba(18, 14, 26, 0.7);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.6rem;
}

.reflection-panel {
    background: rgba(22, 18, 32, 0.8);
    border: 1px solid var(--accent-soft);
    border-radius: 14px;
    padding: 0.9rem 1rem;
    margin: 0.6rem 0 0.8rem 0;
}

.reflection-panel textarea {
    font-size: 16px !important;
    line-height: 1.55 !important;
    min-height: 190px !important;
}

div[data-testid="stSegmentedControl"] button {
    font-size: 0.78rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--border) !important;
}

div[data-testid="stSegmentedControl"] button[aria-pressed="true"] {
    background: var(--bg-card) !important;
    border-color: var(--accent) !important;
    color: var(--text-strong) !important;
    font-weight: 600;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}

@media (max-width: 900px) {
    .calendar-top [data-testid="stHorizontalBlock"] {
        flex-wrap: wrap;
    }
    .calendar-top [data-testid="stHorizontalBlock"] > div {
        flex: 1 1 48%;
        min-width: 140px;
    }
    .calendar-hacker [data-testid="stHorizontalBlock"] {
        flex-direction: column;
    }
    .calendar-card {
        margin-top: 0.6rem;
    }
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

    return {
        "name": active_name,
        "theme": active_theme,
        "toggle_icon": theme_toggle_icon,
        "toggle_help": theme_toggle_help,
    }
