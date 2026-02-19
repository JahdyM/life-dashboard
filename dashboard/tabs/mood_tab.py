import time
from datetime import date

import streamlit as st

from dashboard.data import repositories


DEBOUNCE_SECONDS = 0.8


def _load_day_state(user_email, selected_day, data):
    loaded_key = f"{user_email}:{selected_day.isoformat()}"
    if st.session_state.get("mood.loaded_key") == loaded_key:
        return

    row = data[data["date"] == selected_day]
    row_payload = row.iloc[0].to_dict() if not row.empty else {}
    details = repositories.get_mood_details(user_email, selected_day)

    st.session_state["mood.category"] = details.get("mood_category") or row_payload.get("mood_category") or "Neutro"
    st.session_state["mood.note"] = details.get("mood_note") or row_payload.get("mood_note") or ""
    st.session_state["mood.media_url"] = details.get("mood_media_url") or row_payload.get("mood_media_url") or ""
    st.session_state["mood.tags_input"] = ", ".join(details.get("mood_tags") or [])
    st.session_state["mood.loaded_key"] = loaded_key


def _save_mood_category(user_email, selected_day):
    repositories.save_mood_choice(user_email, selected_day, st.session_state.get("mood.category", "Neutro"))


def _save_mood_details_debounced(user_email, selected_day):
    now = time.monotonic()
    last = float(st.session_state.get("mood.last_save_ts", 0.0) or 0.0)
    if now - last < DEBOUNCE_SECONDS:
        return

    tags = [item.strip() for item in str(st.session_state.get("mood.tags_input", "")).split(",") if item.strip()]
    repositories.save_mood_details(
        user_email,
        selected_day,
        st.session_state.get("mood.note", ""),
        st.session_state.get("mood.media_url", ""),
        tags,
    )
    st.session_state["mood.last_save_ts"] = now


def render_mood_tab(ctx):
    user_email = ctx["current_user_email"]
    data = ctx["data"]
    moods = ctx["constants"]["MOODS"]

    st.markdown("<div class='section-title'>Mood Board</div>", unsafe_allow_html=True)

    selected_day = st.date_input("Date", key="mood.selected_date", value=date.today())
    _load_day_state(user_email, selected_day, data)

    st.selectbox(
        "Mood",
        moods,
        key="mood.category",
        on_change=_save_mood_category,
        args=(user_email, selected_day),
    )

    st.text_area(
        "Notes",
        key="mood.note",
        height=120,
        on_change=_save_mood_details_debounced,
        args=(user_email, selected_day),
    )

    st.text_input(
        "Media URL",
        key="mood.media_url",
        on_change=_save_mood_details_debounced,
        args=(user_email, selected_day),
    )

    st.text_input(
        "Tags (comma-separated)",
        key="mood.tags_input",
        on_change=_save_mood_details_debounced,
        args=(user_email, selected_day),
    )

    media_url = st.session_state.get("mood.media_url", "").strip()
    if media_url:
        st.caption("Media preview")
        st.image(media_url, use_container_width=True)

    st.markdown("<div class='small-label' style='margin-top:8px;'>Timeline</div>", unsafe_allow_html=True)
    timeline = data.sort_values("date", ascending=False).head(30)
    if timeline.empty:
        st.caption("No mood entries yet.")
    for _, row in timeline.iterrows():
        day = row.get("date")
        mood = row.get("mood_category") or "-"
        note = row.get("mood_note") or ""
        tags_raw = row.get("mood_tags_json") or ""
        tags = []
        if tags_raw:
            try:
                import json

                payload = json.loads(tags_raw)
                if isinstance(payload, list):
                    tags = [str(item).strip() for item in payload if str(item).strip()]
            except Exception:
                tags = []
        tags_str = ", ".join(tags)
        st.markdown(f"**{day}** • {mood}")
        if note:
            st.caption(note)
        if tags_str:
            st.caption(f"Tags: {tags_str}")
        st.divider()
