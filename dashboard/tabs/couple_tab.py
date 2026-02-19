import calendar
from datetime import date, timedelta

import streamlit as st

from dashboard.data import repositories


SHARED_HABITS = [
    "bible_reading",
    "meeting_attended",
    "prepare_meeting",
    "workout",
    "shower",
]


def render_couple_tab(ctx):
    user_a = ctx["constants"]["JAHDY_EMAIL"]
    user_b = ctx["constants"]["GUILHERME_EMAIL"]
    mood_heatmap = ctx["helpers"]["mood_heatmap"]
    moods = ctx["constants"]["MOODS"]
    mood_to_int = {mood: idx for idx, mood in enumerate(moods)}

    st.markdown("<div class='section-title'>Couple</div>", unsafe_allow_html=True)

    today = date.today()
    streak_snapshot = repositories.get_shared_habit_comparison(today, user_a, user_b, SHARED_HABITS)

    st.markdown("<div class='small-label'>Comparative shared-habits streak</div>", unsafe_allow_html=True)
    for item in streak_snapshot.get("habits", []):
        key = item.get("habit_key")
        label = ctx["constants"]["DEFAULT_HABIT_LABELS"].get(key, key)
        cols = st.columns(3)
        cols[0].markdown(f"🔥 **{label}**")
        cols[1].caption(f"{item.get('user_a_days', 0)} days | Jahdy")
        cols[2].caption(f"{item.get('user_b_days', 0)} days | Guilherme")

    st.caption(streak_snapshot.get("summary") or "")

    st.markdown("<div class='small-label' style='margin-top:8px;'>Shared mood board (daily comparison)</div>", unsafe_allow_html=True)
    month_choice = st.date_input("Month", value=today.replace(day=1), key="couple.mood.month")
    month_start = month_choice.replace(day=1)
    month_last = calendar.monthrange(month_start.year, month_start.month)[1]
    month_end = month_start.replace(day=month_last)

    feed = repositories.get_couple_mood_feed(user_a, user_b, month_start, month_end)
    by_key = {}
    for row in feed:
        row_email = row.get("user_email")
        row_date = row.get("date")
        mood = row.get("mood_category")
        if not row_email or not row_date or not mood:
            continue
        by_key[(str(row_email), str(row_date))] = mood

    z = [[float("nan") for _ in range(month_last)] for _ in range(2)]
    hover_text = [["" for _ in range(month_last)] for _ in range(2)]
    row_meta = [(0, user_a, "Jahdy"), (1, user_b, "Guilherme")]
    for row_idx, email, label in row_meta:
        for day in range(1, month_last + 1):
            current = month_start.replace(day=day)
            key = (email, current.isoformat())
            mood = by_key.get(key)
            if mood and mood in mood_to_int:
                z[row_idx][day - 1] = mood_to_int[mood]
                hover_text[row_idx][day - 1] = f"{current.isoformat()} • {label}: {mood}"
            else:
                hover_text[row_idx][day - 1] = f"{current.isoformat()} • {label}: no entry"

    x_labels = [str(day) for day in range(1, month_last + 1)]
    y_labels = ["Jahdy", "Guilherme"]
    st.plotly_chart(
        mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Couple Mood Pixel Board"),
        use_container_width=True,
    )

    st.markdown("<div class='small-label' style='margin-top:8px;'>Shared mood board (yearly)</div>", unsafe_allow_html=True)
    years = list(range(today.year - 3, today.year + 1))
    year_choice = st.selectbox("Year", years, index=len(years) - 1, key="couple.mood.year")
    year_start = date(year_choice, 1, 1)
    year_end = date(year_choice, 12, 31)
    feed_year = repositories.get_couple_mood_feed(user_a, user_b, year_start, year_end)

    by_key_year = {}
    for row in feed_year:
        row_email = row.get("user_email")
        row_date = row.get("date")
        mood = row.get("mood_category")
        if not row_email or not row_date or not mood:
            continue
        by_key_year[(str(row_email), str(row_date))] = mood

    total_days = (year_end - year_start).days + 1
    z_year = [[float("nan") for _ in range(total_days)] for _ in range(2)]
    hover_year = [["" for _ in range(total_days)] for _ in range(2)]
    x_year = []

    for day_offset in range(total_days):
        current = year_start + timedelta(days=day_offset)
        x_year.append(current.strftime("%b") if current.day == 1 else "")
        for row_idx, email, label in row_meta:
            mood = by_key_year.get((email, current.isoformat()))
            if mood and mood in mood_to_int:
                z_year[row_idx][day_offset] = mood_to_int[mood]
                hover_year[row_idx][day_offset] = f"{current.isoformat()} • {label}: {mood}"
            else:
                hover_year[row_idx][day_offset] = f"{current.isoformat()} • {label}: no entry"

    st.plotly_chart(
        mood_heatmap(
            z_year,
            hover_year,
            x_labels=x_year,
            y_labels=["Jahdy", "Guilherme"],
            title="Couple Mood Pixel Board (Year)",
        ),
        use_container_width=True,
    )
