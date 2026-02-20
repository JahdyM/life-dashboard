from datetime import date, timedelta

import streamlit as st


def render_stats_tab(ctx):
    data = ctx["data"]

    dot_chart = ctx["helpers"]["dot_chart"]

    st.markdown("<div class='section-title'>Statistics & Charts</div>", unsafe_allow_html=True)

    if data.empty:
        st.info("No persisted data yet.")
        return

    today = date.today()
    today_row = data[data["date"] == today]

    st.markdown("<div class='small-label'>Today's summary</div>", unsafe_allow_html=True)
    summary_cols = st.columns(4)
    if not today_row.empty:
        row = today_row.iloc[0]
        summary_cols[0].metric("Habits completed", int(row.get("habits_completed", 0)))
        summary_cols[1].metric("Life Balance Score", int(round(float(row.get("life_balance_score", 0) or 0))))
        summary_cols[2].metric("Sleep hours", round(float(row.get("sleep_hours", 0) or 0), 1))
        summary_cols[3].metric("Mood", row.get("mood_category") or "-")
    else:
        st.caption("No entry for today.")

    weekly_start = today - timedelta(days=6)
    weekly = data[(data["date"] >= weekly_start) & (data["date"] <= today)]
    if not weekly.empty:
        weekly_cols = st.columns(4)
        weekly_cols[0].metric("Avg sleep (7d)", round(weekly["sleep_hours"].mean(), 1))
        weekly_cols[1].metric("Avg anxiety (7d)", round(weekly["anxiety_level"].mean(), 1))
        weekly_cols[2].metric("Avg work (7d)", round(weekly["work_hours"].mean(), 1))
        weekly_cols[3].metric("Avg boredom (7d)", round(weekly["boredom_minutes"].mean(), 1))

    st.markdown("<div class='small-label' style='margin-top:8px;'>Charts</div>", unsafe_allow_html=True)
    view = st.selectbox("Window", ["Last 7 days", "This month", "This quarter"], index=0, key="stats.view")
    if view == "Last 7 days":
        start_date = today - timedelta(days=6)
        filtered = data[data["date"] >= start_date]
    elif view == "This month":
        filtered = data[data["date"].apply(lambda d: d.year == today.year and d.month == today.month)]
    else:
        quarter_index = (today.month - 1) // 3
        quarter_start = date(today.year, quarter_index * 3 + 1, 1)
        if quarter_index == 3:
            quarter_end = date(today.year, 12, 31)
        else:
            quarter_end = date(today.year, quarter_index * 3 + 4, 1) - timedelta(days=1)
        filtered = data[(data["date"] >= quarter_start) & (data["date"] <= quarter_end)]

    filtered = filtered.sort_values("date").copy()
    filtered["date_str"] = filtered["date"].apply(lambda d: d.strftime("%b %d"))

    if not filtered.empty:
        cols = st.columns(2)
        cols[0].plotly_chart(dot_chart(filtered["sleep_hours"], filtered["date_str"], "Sleep hours", "#a9c0e8"), use_container_width=True)
        cols[1].plotly_chart(dot_chart(filtered["anxiety_level"], filtered["date_str"], "Anxiety level", "#cbb5e2"), use_container_width=True)
        cols[0].plotly_chart(dot_chart(filtered["work_hours"], filtered["date_str"], "Work/study hours", "#b7d1c9"), use_container_width=True)
        cols[1].plotly_chart(dot_chart(filtered["boredom_minutes"], filtered["date_str"], "Boredom minutes", "#f2d4a2"), use_container_width=True)
        cols[0].plotly_chart(dot_chart(filtered["habits_percent"], filtered["date_str"], "Habits completed (%)", "#c9b3e5"), use_container_width=True)
