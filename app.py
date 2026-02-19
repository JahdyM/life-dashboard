import os
from datetime import date, datetime, timedelta
import calendar

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from sqlalchemy import create_engine, inspect, text


DB_PATH = os.path.join(os.path.dirname(__file__), "life_dashboard.db")

DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
DAY_TO_INDEX = {label: idx for idx, label in enumerate(DAY_LABELS)}

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


st.set_page_config(page_title="Personal Life Dashboard", layout="wide")

st.markdown(
    """
<style>
@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

:root {
    --bg-main: #f7f2ec;
    --bg-accent: #efe6d9;
    --bg-card: #fbf6ef;
    --bg-panel: #f1e6d9;
    --border: #cbb9a5;
    --text-main: #2b201c;
    --text-soft: #51433b;
    --button: #cdb7a2;
    --button-hover: #dccbb9;
    --accent-purple: #c9b3e5;
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
    background: radial-gradient(1200px 800px at 25% 0%, #fbf8f3 0%, var(--bg-main) 60%);
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
    box-shadow: 0 10px 24px rgba(0,0,0,0.25);
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
    color: #2b211d;
    border: 1px solid #d8cbb8;
    border-radius: 10px;
    padding: 8px 14px;
    font-weight: 600;
}

.stButton>button:hover {
    background: var(--button-hover);
    border-color: #e3d7c7;
}

button[kind="primary"] {
    background: #e5d5c4 !important;
    color: #2b211d !important;
    border: 1px solid #cbb9a5 !important;
}

button[kind="primary"]:hover {
    background: #efe1d2 !important;
    border-color: #d6c7b5 !important;
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

/* Improve contrast on light background */
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
    background: #f7efe4;
    border-color: #b9a792;
}

div[data-baseweb="input"] input:focus,
div[data-baseweb="textarea"] textarea:focus,
div[data-baseweb="select"] > div:focus,
div[data-baseweb="select"] > div:focus-within {
    background: #f9f2e8;
    border-color: #ad9a85;
    box-shadow: 0 0 0 2px rgba(201, 179, 229, 0.25);
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
    background: #efe1d2 !important;
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
    background: #efe1d2 !important;
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
    background: #efe1d2 !important;
    color: var(--text-main) !important;
}

div[data-baseweb="popover"] [role="option"][aria-selected="true"] {
    background: var(--accent-purple) !important;
    color: #2b201c !important;
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
    background: #efe1d2 !important;
    color: var(--text-main) !important;
}

div[data-baseweb="calendar"] button[aria-selected="true"] {
    background: var(--accent-purple) !important;
    color: #2b201c !important;
}

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
        return

    if not st.user.is_logged_in:
        st.markdown("<div class='section-title'>Login Required</div>", unsafe_allow_html=True)
        st.markdown("Use Google to access your private dashboard.")
        if st.button("Login with Google", key="google_login"):
            st.login("google")
        st.stop()

    allowed_email = (
        get_secret(("app", "allowed_email"))
        or os.getenv("ALLOWED_EMAIL")
        or ""
    ).strip().lower()
    user_email = str(getattr(st.user, "email", "")).strip().lower()
    if allowed_email and user_email != allowed_email:
        st.error("Access denied for this account.")
        if st.button("Logout", key="logout_denied"):
            st.logout()
        st.stop()

    with st.sidebar:
        st.caption(f"Logged as: {getattr(st.user, 'email', 'unknown')}")
        if st.button("Logout", key="logout_sidebar"):
            st.logout()


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
    columns = ",\n    ".join([f"{key} INTEGER DEFAULT 0" for key, _ in HABITS])
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS daily_entries (
                    date TEXT PRIMARY KEY,
                    {columns},
                    sleep_hours REAL,
                    anxiety_level INTEGER,
                    work_hours REAL,
                    boredom_minutes INTEGER,
                    mood_category TEXT,
                    priority_label TEXT,
                    priority_done INTEGER DEFAULT 0
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
                """
            )
        )

    # Ensure new columns exist for existing databases
    existing_cols = {
        col["name"] for col in inspect(engine).get_columns("daily_entries")
    }
    with engine.begin() as conn:
        if "priority_label" not in existing_cols:
            conn.execute(text("ALTER TABLE daily_entries ADD COLUMN priority_label TEXT"))
        if "priority_done" not in existing_cols:
            conn.execute(text("ALTER TABLE daily_entries ADD COLUMN priority_done INTEGER DEFAULT 0"))


def upsert_entry(payload):
    engine = get_engine(get_database_url())
    columns = ["date"] + [h[0] for h in HABITS] + [
        "sleep_hours",
        "anxiety_level",
        "work_hours",
        "boredom_minutes",
        "mood_category",
        "priority_label",
        "priority_done",
    ]
    placeholders = ", ".join([f":{col}" for col in columns])
    updates = ", ".join([f"{col}=EXCLUDED.{col}" for col in columns[1:]])
    values = {col: payload.get(col) for col in columns}
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                INSERT INTO daily_entries ({', '.join(columns)})
                VALUES ({placeholders})
                ON CONFLICT(date) DO UPDATE SET {updates}
                """
            ),
            values,
        )


def delete_entries(start_date, end_date=None):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        if end_date is None:
            cursor = conn.execute(
                text("DELETE FROM daily_entries WHERE date = :start"),
                {"start": start_date.isoformat()},
            )
        else:
            cursor = conn.execute(
                text("DELETE FROM daily_entries WHERE date BETWEEN :start AND :end"),
                {"start": start_date.isoformat(), "end": end_date.isoformat()},
            )
    return cursor.rowcount if cursor.rowcount is not None else 0


def get_setting(key):
    engine = get_engine(get_database_url())
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT value FROM settings WHERE key = :key"),
            {"key": key},
        ).fetchone()
    return row[0] if row else None


def set_setting(key, value):
    engine = get_engine(get_database_url())
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO settings (key, value) VALUES (:key, :value) "
                "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value"
            ),
            {"key": key, "value": value},
        )


def get_meeting_days():
    raw = get_setting("meeting_days")
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


def load_data():
    engine = get_engine(get_database_url())
    with engine.connect() as conn:
        df = pd.read_sql(text("SELECT * FROM daily_entries"), conn)
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


def get_entry_for_date(entry_date, data):
    if data.empty:
        return {}
    row = data[data["date"] == entry_date]
    if row.empty:
        return {}
    return row.iloc[0].to_dict()


def load_entry_into_state(entry_date, entry):
    if st.session_state.get("loaded_date") == entry_date:
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
    st.session_state["loaded_date"] = entry_date


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
        title_font=dict(color="#2b201c", size=16, family="Crimson Text"),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#3d2f2b", family="IBM Plex Sans"),
        margin=dict(l=40, r=20, t=40, b=30),
        xaxis=dict(
            showgrid=show_xgrid,
            gridcolor="#dfd3c3",
            tickfont=dict(color="#5e4e46"),
            zeroline=False,
            showline=True,
            linecolor="#d8cbb8",
            mirror=True,
        ),
        yaxis=dict(
            showgrid=show_ygrid,
            gridcolor="#dfd3c3",
            zeroline=False,
            tickfont=dict(color="#5e4e46"),
            showline=True,
            linecolor="#d8cbb8",
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


def mood_heatmap(z, text, x_labels, y_labels, title=""):
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
            text=text,
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
        title_font=dict(color="#2b201c", size=16, family="Crimson Text"),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#3d2f2b", family="IBM Plex Sans"),
        margin=dict(l=20, r=20, t=40, b=20),
        xaxis=dict(
            showgrid=False,
            zeroline=False,
            tickfont=dict(color="#5e4e46", size=11),
            tickmode="array",
            tickvals=list(range(len(x_labels))),
            ticktext=x_labels,
            side="top",
            showline=True,
            linecolor="#d8cbb8",
            mirror=True,
        ),
        yaxis=dict(
            showgrid=False,
            zeroline=False,
            tickmode="array",
            tickvals=list(range(len(y_labels))),
            ticktext=y_labels,
            autorange="reversed",
            tickfont=dict(color="#5e4e46", size=10),
            showline=True,
            linecolor="#d8cbb8",
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
            marker=dict(size=8, color=color, line=dict(width=1, color="#3d2f2b")),
        )
    )
    apply_common_plot_style(fig, title, show_xgrid=True, show_ygrid=True)
    fig.update_layout(height=height)
    fig.update_yaxes(categoryorder="array", categoryarray=list(dates), automargin=True)
    fig.update_xaxes(tickfont=dict(size=10, color="#5e4e46"))
    return fig


init_db()
enforce_google_login()

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

# --- DAILY INPUT PANEL ---

st.markdown("<div class='section-title'>Daily Input Panel</div>", unsafe_allow_html=True)

if "selected_date" not in st.session_state:
    st.session_state["selected_date"] = date.today()

selected_date = st.date_input("Date", value=st.session_state["selected_date"], key="selected_date")
entry = get_entry_for_date(selected_date, data)
load_entry_into_state(selected_date, entry)
is_meeting_day = selected_date.weekday() in meeting_days
if not is_meeting_day:
    st.session_state["input_meeting_attended"] = False
    st.session_state["input_prepare_meeting"] = False

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
    st.caption("Meeting habits are only enabled on scheduled meeting days.")

st.markdown("<div class='small-label' style='margin-top:6px;'>Daily priority habit</div>", unsafe_allow_html=True)
priority_cols = st.columns([3, 1])
with priority_cols[0]:
    st.text_input("Priority focus for today", key="input_priority_label", on_change=auto_save)
with priority_cols[1]:
    disabled_priority = not bool(st.session_state.get("input_priority_label", "").strip())
    st.checkbox("Done", key="input_priority_done", on_change=auto_save, disabled=disabled_priority)

st.markdown("<div class='small-label'>Habits</div>", unsafe_allow_html=True)
habit_cols = st.columns(2)
for i, (key, label) in enumerate(HABITS):
    with habit_cols[i % 2]:
        disabled = key in ("meeting_attended", "prepare_meeting") and not is_meeting_day
        st.checkbox(label, key=f"input_{key}", on_change=auto_save, disabled=disabled)

st.markdown("<div class='small-label' style='margin-top:8px;'>Daily Metrics</div>", unsafe_allow_html=True)
metric_cols = st.columns(5)
with metric_cols[0]:
    st.number_input(
        "Sleep hours",
        min_value=0.0,
        max_value=12.0,
        step=0.5,
        key="input_sleep_hours",
        on_change=auto_save,
    )
with metric_cols[1]:
    st.number_input(
        "Anxiety level",
        min_value=1,
        max_value=10,
        step=1,
        key="input_anxiety_level",
        on_change=auto_save,
    )
with metric_cols[2]:
    st.number_input(
        "Work/study hours",
        min_value=0.0,
        max_value=16.0,
        step=0.5,
        key="input_work_hours",
        on_change=auto_save,
    )
with metric_cols[3]:
    st.number_input(
        "Boredom minutes",
        min_value=0,
        max_value=60,
        step=5,
        key="input_boredom_minutes",
        on_change=auto_save,
    )
with metric_cols[4]:
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

if data.empty:
    st.markdown("Add mood entries to see the pixel board.")
else:
    mood_map = {row["date"]: row["mood_category"] for _, row in data.iterrows() if row.get("mood_category")}

    now = date.today()
    month_col, year_col = st.columns(2)

    with month_col:
        month_choice = st.date_input("Monthly view", value=now.replace(day=1))
        z, text, x_labels, y_labels = build_month_tracker_grid(month_choice.year, month_choice.month, mood_map)
        fig_month = mood_heatmap(z, text, x_labels=x_labels, y_labels=y_labels, title="Monthly Mood Grid")
        st.plotly_chart(fig_month, use_container_width=True)

    with year_col:
        year_choice = st.selectbox("Year", list(range(now.year - 3, now.year + 1)), index=3)
        z, text, x_labels, y_labels = build_year_tracker_grid(year_choice, mood_map)
        fig_year = mood_heatmap(z, text, x_labels=x_labels, y_labels=y_labels, title="Yearly Mood Grid")
        st.plotly_chart(fig_year, use_container_width=True)

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
