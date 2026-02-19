from datetime import date

import streamlit as st


def render_global_header(ctx):
    data = ctx["data"]
    streak_count = ctx["helpers"]["streak_count"]

    st.markdown(
        """
        <style>
        .sticky-header-wrap {
            position: sticky;
            top: 0.25rem;
            z-index: 999;
            padding: 0.5rem;
            border-radius: 14px;
            border: 1px solid var(--divider);
            backdrop-filter: blur(8px);
            background: var(--bg-panel);
            margin-bottom: 0.8rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    today = date.today()
    row = data[data["date"] == today] if not data.empty else None

    score = 0
    mood = "-"
    habits_percent = 0
    if row is not None and not row.empty:
        score = int(round(float(row.iloc[0].get("life_balance_score", 0) or 0)))
        mood = row.iloc[0].get("mood_category") or "-"
        habits_percent = int(round(float(row.iloc[0].get("habits_percent", 0) or 0)))

    daily_streak = streak_count(data, "workout", today) if not data.empty else 0

    indicators = ctx.get("quick_indicators", {})
    pending_tasks = indicators.get("pending_tasks", 0)

    st.markdown("<div class='sticky-header-wrap'>", unsafe_allow_html=True)
    cols = st.columns(5)
    cols[0].metric("Daily streak", f"{daily_streak}d")
    cols[1].metric("Life balance", f"{score}")
    cols[2].metric("Habits %", f"{habits_percent}%")
    cols[3].metric("Mood", mood)
    cols[4].metric("Pending tasks", int(pending_tasks))
    st.markdown("</div>", unsafe_allow_html=True)
