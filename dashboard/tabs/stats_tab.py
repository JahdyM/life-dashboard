from datetime import date, timedelta

import streamlit as st

from dashboard.visualizations import dot_chart
from dashboard.data.loaders import load_data, load_custom_habit_done_by_date
from dashboard.data import repositories
from dashboard.metrics import compute_habits_metrics, compute_balance_score

def render_stats_tab(ctx):
    data = ctx.get("data")
    api_enabled = repositories.api_enabled()

    st.markdown("<div class='section-title'>Statistics & Charts</div>", unsafe_allow_html=True)

    today = date.today()
    if data is None or (api_enabled and getattr(data, "empty", True)):
        range_start = today - timedelta(days=180)
        data = load_data(range_start, today)

    if data is None or getattr(data, "empty", True):
        st.info("No persisted data yet.")
        return

    custom_habits = repositories.get_custom_habits(ctx.get("current_user_email"), active_only=True)
    custom_habit_ids = [habit["id"] for habit in custom_habits]
    start_bound = data["date"].min() if not data.empty else today
    end_bound = data["date"].max() if not data.empty else today
    custom_done_by_date = load_custom_habit_done_by_date(start_bound, end_bound)
    metrics = data.apply(
        lambda row: compute_habits_metrics(
            row,
            ctx.get("meeting_days", []),
            ctx.get("family_worship_day", 6),
            custom_done_by_date,
            custom_habit_ids,
        ),
        axis=1,
        result_type="expand",
    )
    data = data.copy()
    data["habits_completed"] = metrics[0]
    data["habits_percent"] = metrics[1]
    data["habits_total"] = metrics[2]
    data["life_balance_score"] = data.apply(compute_balance_score, axis=1)
    data["weekday"] = data["date"].apply(lambda d: d.weekday())
    data["is_weekend"] = data["weekday"] >= 5

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
        weekly_cols[0].metric(
            "Avg sleep (7d)",
            round(weekly["sleep_hours"].mean(), 1) if not weekly["sleep_hours"].isna().all() else 0,
        )
        weekly_cols[1].metric(
            "Avg anxiety (7d)",
            round(weekly["anxiety_level"].mean(), 1) if not weekly["anxiety_level"].isna().all() else 0,
        )
        weekly_cols[2].metric(
            "Avg work (7d)",
            round(weekly["work_hours"].mean(), 1) if not weekly["work_hours"].isna().all() else 0,
        )
        weekly_cols[3].metric(
            "Avg boredom (7d)",
            round(weekly["boredom_minutes"].mean(), 1) if not weekly["boredom_minutes"].isna().all() else 0,
        )

    # Best streaks section
    if not data.empty:
        st.markdown("<div class='small-label' style='margin-top:10px;'>Maiores sequências</div>", unsafe_allow_html=True)
        from dashboard.constants import HABITS, FIXED_COUPLE_HABIT_KEYS, DEFAULT_HABIT_LABELS
        streak_cols = st.columns(4)
        streaks_computed = []
        for habit_key, _ in HABITS:
            if habit_key not in FIXED_COUPLE_HABIT_KEYS:
                continue
            sorted_dates = sorted(data["date"].tolist())
            best = 0
            current_streak = 0
            prev_date = None
            for d in sorted_dates:
                row = data[data["date"] == d]
                if row.empty:
                    continue
                done = int(row.iloc[0].get(habit_key, 0) or 0)
                if done:
                    if prev_date and (d - prev_date).days == 1:
                        current_streak += 1
                    else:
                        current_streak = 1
                    best = max(best, current_streak)
                else:
                    current_streak = 0
                prev_date = d
            if best > 0:
                streaks_computed.append((DEFAULT_HABIT_LABELS.get(habit_key, habit_key), best))
        streaks_computed.sort(key=lambda x: x[1], reverse=True)
        for idx, (label, best) in enumerate(streaks_computed[:4]):
            with streak_cols[idx % 4]:
                st.markdown(
                    f"<div class='streak-row'>"
                    f"<div class='streak-title'><span class='streak-emoji'>🏆</span>{label}</div>"
                    f"<div class='streak-line'>{best} dias seguidos</div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )

    st.markdown("<div class='small-label' style='margin-top:8px;'>Gráficos</div>", unsafe_allow_html=True)
    view = st.selectbox("Período", ["Últimos 7 dias", "Este mês", "Este trimestre"], index=0, key="stats.view")
    if view == "Últimos 7 dias":
        start_date = today - timedelta(days=6)
        filtered = data[data["date"] >= start_date]
    elif view == "Este mês":
        filtered = data[data["date"].apply(lambda d: d.year == today.year and d.month == today.month)]
    else:
        quarter_index = (today.month - 1) // 3
        quarter_start_month = quarter_index * 3 + 1
        quarter_start = date(today.year, quarter_start_month, 1)
        next_quarter_month = quarter_start_month + 3
        if next_quarter_month > 12:
            quarter_end = date(today.year, 12, 31)
        else:
            quarter_end = date(today.year, next_quarter_month, 1) - timedelta(days=1)
        filtered = data[(data["date"] >= quarter_start) & (data["date"] <= quarter_end)]

    filtered = filtered.sort_values("date").copy()
    filtered["date_str"] = filtered["date"].apply(lambda d: d.strftime("%b %d"))

    if not filtered.empty:
        cols = st.columns(2)
        cols[0].plotly_chart(dot_chart(filtered["sleep_hours"], filtered["date_str"], "Horas de sono", "#a9c0e8"), use_container_width=True)
        cols[1].plotly_chart(dot_chart(filtered["anxiety_level"], filtered["date_str"], "Nível de ansiedade", "#cbb5e2"), use_container_width=True)
        cols[0].plotly_chart(dot_chart(filtered["work_hours"], filtered["date_str"], "Horas de trabalho/estudo", "#b7d1c9"), use_container_width=True)
        cols[1].plotly_chart(dot_chart(filtered["boredom_minutes"], filtered["date_str"], "Minutos de tédio", "#f2d4a2"), use_container_width=True)
        cols[0].plotly_chart(dot_chart(filtered["habits_percent"], filtered["date_str"], "Hábitos completos (%)", "#c9b3e5"), use_container_width=True)
