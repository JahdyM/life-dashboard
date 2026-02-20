from datetime import date

import streamlit as st

from dashboard.data import repositories


def _get_selected_date():
    if "habits.selected_date" not in st.session_state:
        st.session_state["habits.selected_date"] = date.today()
    return st.session_state["habits.selected_date"]


def _save_fixed_habit(user_email, selected_day, habit_key, widget_key):
    repositories.save_habit_toggle(
        user_email,
        selected_day,
        habit_key,
        st.session_state.get(widget_key, False),
    )


def _save_metrics(user_email, selected_day):
    repositories.save_entry_fields(
        user_email,
        selected_day,
        {
            "sleep_hours": float(st.session_state.get("habits.sleep_hours", 0) or 0),
            "anxiety_level": int(st.session_state.get("habits.anxiety_level", 1) or 1),
            "work_hours": float(st.session_state.get("habits.work_hours", 0) or 0),
            "boredom_minutes": int(st.session_state.get("habits.boredom_minutes", 0) or 0),
            "mood_category": st.session_state.get("habits.mood_category", "Neutro"),
            "priority_label": (st.session_state.get("habits.priority_label") or "").strip(),
            "priority_done": int(bool(st.session_state.get("habits.priority_done", False))),
        },
    )


def _save_daily_text(user_email, selected_day):
    repositories.set_daily_text(user_email, selected_day, st.session_state.get("habits.daily_text", ""))


def _save_custom_done(user_email, selected_day, custom_habits):
    payload = {}
    for habit in custom_habits:
        key = f"habits.custom_done.{habit['id']}"
        payload[habit["id"]] = int(bool(st.session_state.get(key, False)))
    repositories.set_custom_habit_done(user_email, selected_day, payload)


def _save_meeting_days(user_email, day_to_index):
    labels = st.session_state.get("habits.meeting_days_labels", [])
    selected = [day_to_index[label] for label in labels if label in day_to_index]
    repositories.set_meeting_days(user_email, selected)
    st.session_state["habits.meeting_days_values"] = selected
    st.session_state["meeting_days"] = selected


def _save_family_worship_day(user_email, day_to_index):
    label = st.session_state.get("habits.family_worship_label")
    if label not in day_to_index:
        return
    day_index = day_to_index[label]
    repositories.set_family_worship_day(user_email, day_index)
    st.session_state["habits.family_worship_day_value"] = day_index
    st.session_state["family_worship_day"] = day_index


def render_habits_tab(ctx):
    user_email = ctx["current_user_email"]
    day_labels = ctx["constants"]["DAY_LABELS"]
    day_to_index = ctx["constants"]["DAY_TO_INDEX"]
    fixed_habit_keys = ctx["constants"]["FIXED_COUPLE_HABIT_KEYS"]
    meeting_habit_keys = ctx["constants"]["MEETING_HABIT_KEYS"]
    family_worship_keys = ctx["constants"]["FAMILY_WORSHIP_HABIT_KEYS"]
    default_habit_labels = ctx["constants"]["DEFAULT_HABIT_LABELS"]
    moods = ctx["constants"]["MOODS"]

    meeting_days = ctx["meeting_days"]
    family_worship_day = ctx.get("family_worship_day", 6)
    if "habits.meeting_days_labels" not in st.session_state:
        st.session_state["habits.meeting_days_labels"] = [day_labels[i] for i in meeting_days]
    if "habits.family_worship_label" not in st.session_state:
        st.session_state["habits.family_worship_label"] = day_labels[family_worship_day]

    st.markdown("<div class='section-title'>Daily Habits</div>", unsafe_allow_html=True)

    selected_day = st.session_state.get("habits.selected_date", date.today())
    if repositories.api_enabled():
        row_payload = repositories.get_day_entry(user_email, selected_day)
    else:
        data = ctx["data"]
        row = data[data["date"] == selected_day]
        row_payload = row.iloc[0].to_dict() if not row.empty else {}
    loaded_key = f"{user_email}:{selected_day.isoformat()}"

    selected_meeting_days = st.session_state.get(
        "habits.meeting_days_values",
        [day_to_index[label] for label in st.session_state.get("habits.meeting_days_labels", [])],
    )
    ctx["meeting_days"] = selected_meeting_days
    is_meeting_day = selected_day.weekday() in selected_meeting_days
    selected_family_day = st.session_state.get("habits.family_worship_day_value", family_worship_day)
    is_family_worship_day = selected_day.weekday() == selected_family_day

    top_cols = st.columns([1.15, 0.85])
    with top_cols[0]:
        st.markdown("<div class='habits-tight'>", unsafe_allow_html=True)
        selected_day = st.date_input("Date", key="habits.selected_date", value=selected_day)
        st.markdown("<div class='panel habits-compact'>", unsafe_allow_html=True)
        st.markdown("<div class='small-label'>Fixed shared habits</div>", unsafe_allow_html=True)
        fixed_cols = st.columns(2)
        idx = 0
        for habit_key in fixed_habit_keys:
            if habit_key in meeting_habit_keys and not is_meeting_day:
                continue
            if habit_key in family_worship_keys and not is_family_worship_day:
                continue
            widget_key = f"habits.fixed.{habit_key}"
            if st.session_state.get("habits.loaded_key") != loaded_key:
                st.session_state[widget_key] = bool(row_payload.get(habit_key, 0))
            with fixed_cols[idx % 2]:
                st.checkbox(
                    default_habit_labels.get(habit_key, habit_key),
                    key=widget_key,
                    on_change=_save_fixed_habit,
                    args=(user_email, selected_day, habit_key, widget_key),
                )
            idx += 1
        st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("<div class='panel habits-compact'>", unsafe_allow_html=True)
        st.markdown("<div class='small-label'>Personal habits</div>", unsafe_allow_html=True)
        custom_habits = repositories.get_custom_habits(user_email, active_only=True)
        custom_done = repositories.get_custom_habit_done(user_email, selected_day)

        for habit in custom_habits:
            row_cols = st.columns([0.22, 6.1, 0.38, 0.38])
            done_key = f"habits.custom_done.{habit['id']}"
            if st.session_state.get("habits.loaded_key") != loaded_key:
                st.session_state[done_key] = bool(custom_done.get(habit["id"], 0))
            with row_cols[0]:
                st.checkbox(
                    "",
                    key=done_key,
                    label_visibility="collapsed",
                    on_change=_save_custom_done,
                    args=(user_email, selected_day, custom_habits),
                )
            with row_cols[1]:
                edit_key = f"habits.editing.{habit['id']}"
                name_key = f"habits.edit_name.{habit['id']}"
                if st.session_state.get(edit_key, False):
                    st.text_input("Edit", key=name_key, label_visibility="collapsed")
                else:
                    st.markdown(habit["name"])

            with row_cols[2]:
                edit_key = f"habits.editing.{habit['id']}"
                name_key = f"habits.edit_name.{habit['id']}"
                if st.session_state.get(edit_key, False):
                    if st.button("✔", key=f"habits.save.{habit['id']}", type="tertiary"):
                        try:
                            repositories.save_habit_label_edit(user_email, habit["id"], st.session_state.get(name_key, ""))
                            st.session_state[edit_key] = False
                            st.rerun()
                        except Exception as exc:
                            st.warning(str(exc))
                else:
                    if st.button("✎", key=f"habits.edit.{habit['id']}", type="tertiary"):
                        st.session_state[edit_key] = True
                        st.session_state[name_key] = habit["name"]
                        st.rerun()
            with row_cols[3]:
                if st.button("✕", key=f"habits.delete.{habit['id']}", type="tertiary"):
                    repositories.delete_habit(user_email, habit["id"])
                    st.rerun()

        with st.form(key="habits.add_form", clear_on_submit=True):
            add_cols = st.columns([6.1, 0.6])
            with add_cols[0]:
                st.text_input("New habit", key="habits.new_habit", placeholder="Add a personal habit...")
            with add_cols[1]:
                submit_add = st.form_submit_button("+", use_container_width=True)

        if submit_add:
            try:
                repositories.add_habit(user_email, st.session_state.get("habits.new_habit", ""))
                st.rerun()
            except Exception as exc:
                st.warning(str(exc))

        st.markdown("</div>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)
    with top_cols[1]:
        st.markdown("<div class='panel'>", unsafe_allow_html=True)
        if st.session_state.get("habits.loaded_key") != loaded_key:
            st.session_state["habits.sleep_hours"] = float(row_payload.get("sleep_hours", 0) or 0)
            st.session_state["habits.anxiety_level"] = int(row_payload.get("anxiety_level", 1) or 1)
            st.session_state["habits.work_hours"] = float(row_payload.get("work_hours", 0) or 0)
            st.session_state["habits.boredom_minutes"] = int(row_payload.get("boredom_minutes", 0) or 0)
            st.session_state["habits.mood_category"] = (row_payload.get("mood_category") or "Neutro")
            st.session_state["habits.priority_label"] = row_payload.get("priority_label") or ""
            st.session_state["habits.priority_done"] = bool(row_payload.get("priority_done", 0))
            st.session_state["habits.loaded_key"] = loaded_key

        metrics_cols = st.columns(2)
        with metrics_cols[0]:
            st.number_input(
                "Sleep hours",
                min_value=0.0,
                max_value=12.0,
                step=0.5,
                key="habits.sleep_hours",
                on_change=_save_metrics,
                args=(user_email, selected_day),
            )
            st.number_input(
                "Anxiety level",
                min_value=1,
                max_value=10,
                step=1,
                key="habits.anxiety_level",
                on_change=_save_metrics,
                args=(user_email, selected_day),
            )
            st.number_input(
                "Work/study hours",
                min_value=0.0,
                max_value=16.0,
                step=0.5,
                key="habits.work_hours",
                on_change=_save_metrics,
                args=(user_email, selected_day),
            )
        with metrics_cols[1]:
            st.number_input(
                "Boredom minutes",
                min_value=0,
                max_value=60,
                step=5,
                key="habits.boredom_minutes",
                on_change=_save_metrics,
                args=(user_email, selected_day),
            )
            st.selectbox(
                "Mood",
                moods,
                key="habits.mood_category",
                on_change=_save_metrics,
                args=(user_email, selected_day),
            )
            st.text_input(
                "Priority focus",
                key="habits.priority_label",
                on_change=_save_metrics,
                args=(user_email, selected_day),
            )
            st.checkbox(
                "Priority done",
                key="habits.priority_done",
                on_change=_save_metrics,
                args=(user_email, selected_day),
            )
        st.markdown("</div>", unsafe_allow_html=True)

        st.multiselect(
            "Weekly meeting days",
            options=day_labels,
            key="habits.meeting_days_labels",
            on_change=_save_meeting_days,
            args=(user_email, day_to_index),
        )
        st.selectbox(
            "Family worship day",
            options=day_labels,
            key="habits.family_worship_label",
            on_change=_save_family_worship_day,
            args=(user_email, day_to_index),
        )

    # (moved above) selected_meeting_days / is_meeting_day already computed

    # removed extra body columns to keep habits directly below date
