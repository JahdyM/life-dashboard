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
    name_by_email = {
        user_a: "Jahdy",
        user_b: "Guilherme",
    }

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

    st.markdown("<div class='small-label' style='margin-top:8px;'>Shared mood board</div>", unsafe_allow_html=True)
    start_date = st.date_input("From", value=today - timedelta(days=30), key="couple.mood.start")
    end_date = st.date_input("To", value=today, key="couple.mood.end")

    if start_date > end_date:
        st.warning("Start date must be before end date.")
        return

    feed = repositories.get_couple_mood_feed(user_a, user_b, start_date, end_date)
    if not feed:
        st.caption("No shared mood entries in this period.")
        return

    for row in feed:
        author = name_by_email.get(row.get("user_email"), row.get("user_email"))
        mood = row.get("mood_category") or "-"
        day = row.get("date")
        note = row.get("mood_note") or ""
        media = row.get("mood_media_url") or ""
        st.markdown(f"**{day}** • **{author}** • {mood}")
        if note:
            st.caption(note)
        if media:
            st.markdown(f"[Media link]({media})")
        st.divider()
