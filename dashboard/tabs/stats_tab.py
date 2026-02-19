from datetime import date, timedelta

import streamlit as st


def render_stats_tab(ctx):
    data = ctx["data"]

    dot_chart = ctx["helpers"]["dot_chart"]
    mood_heatmap = ctx["helpers"]["mood_heatmap"]
    build_month_tracker_grid = ctx["helpers"]["build_month_tracker_grid"]
    build_year_tracker_grid = ctx["helpers"]["build_year_tracker_grid"]

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
    view = st.selectbox("Window", ["Last 7 days", "This month"], index=0, key="stats.view")
    if view == "Last 7 days":
        start_date = today - timedelta(days=6)
        filtered = data[data["date"] >= start_date]
    else:
        filtered = data[data["date"].apply(lambda d: d.year == today.year and d.month == today.month)]

    filtered = filtered.sort_values("date").copy()
    filtered["date_str"] = filtered["date"].apply(lambda d: d.strftime("%b %d"))

    if not filtered.empty:
        cols = st.columns(2)
        cols[0].plotly_chart(dot_chart(filtered["sleep_hours"], filtered["date_str"], "Sleep hours", "#a9c0e8"), use_container_width=True)
        cols[1].plotly_chart(dot_chart(filtered["anxiety_level"], filtered["date_str"], "Anxiety level", "#cbb5e2"), use_container_width=True)
        cols[0].plotly_chart(dot_chart(filtered["work_hours"], filtered["date_str"], "Work/study hours", "#b7d1c9"), use_container_width=True)
        cols[1].plotly_chart(dot_chart(filtered["boredom_minutes"], filtered["date_str"], "Boredom minutes", "#f2d4a2"), use_container_width=True)
        cols[0].plotly_chart(dot_chart(filtered["habits_percent"], filtered["date_str"], "Habits completed (%)", "#c9b3e5"), use_container_width=True)

    st.markdown("<div class='small-label' style='margin-top:8px;'>Mood board</div>", unsafe_allow_html=True)
    mood_map = {row["date"]: row["mood_category"] for _, row in data.iterrows() if row.get("mood_category")}

    month_col, year_col = st.columns(2)
    with month_col:
        month_choice = st.date_input("Month", value=today.replace(day=1), key="stats.mood.month")
        z, hover_text, x_labels, y_labels = build_month_tracker_grid(month_choice.year, month_choice.month, mood_map)
        st.plotly_chart(
            mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Monthly Mood Grid"),
            use_container_width=True,
        )
    with year_col:
        year_choice = st.selectbox("Year", list(range(today.year - 3, today.year + 1)), index=3, key="stats.mood.year")
        z, hover_text, x_labels, y_labels = build_year_tracker_grid(year_choice, mood_map)
        st.plotly_chart(
            mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Yearly Mood Grid"),
            use_container_width=True,
        )
