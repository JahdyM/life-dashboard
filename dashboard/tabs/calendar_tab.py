from datetime import date, datetime, timedelta

import streamlit as st

from dashboard.data import repositories
from dashboard.services import google_calendar
from dashboard.state import session_slices


PRIORITY_TAGS = ["High", "Medium", "Low"]


def _get_calendar_ids(ctx, user_email):
    primary = user_email
    secret_getter = ctx["helpers"]["get_secret"]

    if user_email == ctx["constants"]["JAHDY_EMAIL"]:
        raw = secret_getter(("app", "JAHDY_GOOGLE_ALLOWED_CALENDAR_IDS"), "") or secret_getter(("JAHDY_GOOGLE_ALLOWED_CALENDAR_IDS",), "")
    elif user_email == ctx["constants"]["GUILHERME_EMAIL"]:
        raw = secret_getter(("app", "GUILHERME_GOOGLE_ALLOWED_CALENDAR_IDS"), "") or secret_getter(("GUILHERME_GOOGLE_ALLOWED_CALENDAR_IDS",), "")
    else:
        raw = ""

    extra = [item.strip() for item in str(raw).split(",") if item.strip()]
    calendar_ids = [primary] + [item for item in extra if item != primary]
    return calendar_ids


def _handle_google_oauth_callback(user_email):
    params = st.query_params
    code = params.get("code")
    state = params.get("state")
    if not code:
        return
    try:
        if not state or str(state).split("|")[0] != user_email:
            st.warning("Ignoring Google callback with mismatched state.")
            return
        google_calendar.connect_from_code(user_email, str(code))
        st.success("Google Calendar connected.")
    except Exception as exc:
        st.warning(f"Google Calendar connection failed: {exc}")
    finally:
        st.query_params.clear()
        st.rerun()


def _get_day_events(ctx, user_email, selected_day, start_day, end_day):
    connected = google_calendar.is_connected(user_email)
    if connected:
        try:
            calendar_ids = _get_calendar_ids(ctx, user_email)
            events = google_calendar.list_events_for_range(user_email, start_day, end_day, calendar_ids)
            day_events = [
                event
                for event in events
                if event["start_date"] <= selected_day <= event["end_date"]
            ]
            return day_events, None, "google_api"
        except Exception as exc:
            return [], f"Google API error: {exc}", "google_api"

    ics_url, secret_key = ctx["helpers"]["get_user_calendar_ics_url"](user_email)
    if not ics_url:
        return [], f"Missing private calendar URL in backend secret: {secret_key}", "ics"

    events, error = ctx["helpers"]["fetch_ics_events_for_range"](ics_url, start_day, end_day)
    if error:
        return [], error, "ics"
    day_events = ctx["helpers"]["filter_events_for_date"](events, selected_day)
    return day_events, None, "ics"


def _draft_for_day(selected_day):
    calendar_slice = session_slices.get_slice("calendar")
    drafts = calendar_slice.setdefault("drafts_by_date", {})
    day_key = selected_day.isoformat()
    if day_key not in drafts:
        drafts[day_key] = {
            "title": "",
            "priority": "Medium",
            "estimated_minutes": 30,
            "has_time": False,
            "time": datetime.now().replace(second=0, microsecond=0).time(),
        }
    return drafts[day_key]


def render_calendar_tab(ctx):
    user_email = ctx["current_user_email"]

    _handle_google_oauth_callback(user_email)

    st.markdown("<div class='section-title'>Calendar & Activities</div>", unsafe_allow_html=True)

    top_cols = st.columns([2, 2, 2, 1.5])
    with top_cols[0]:
        selected_day = st.date_input("Selected day", key="calendar.selected_day", value=date.today())
    with top_cols[1]:
        view_mode = st.selectbox("View", ["Week", "Month"], index=0, key="calendar.view_mode")
    with top_cols[2]:
        if view_mode == "Week":
            week_ref = st.date_input("Week reference", value=selected_day, key="calendar.week_ref")
            start_day, end_day = ctx["helpers"]["get_week_range"](week_ref)
        else:
            month_ref = st.date_input("Month reference", value=selected_day.replace(day=1), key="calendar.month_ref")
            start_day = month_ref.replace(day=1)
            end_day = ctx["helpers"]["month_last_day"](start_day)
    with top_cols[3]:
        connect_url, _ = google_calendar.build_connect_url(user_email)
        st.link_button("Connect Calendar", connect_url, use_container_width=True)

    st.caption(f"Range: {start_day.strftime('%d/%m/%Y')} - {end_day.strftime('%d/%m/%Y')}")

    day_events, events_error, event_source = _get_day_events(ctx, user_email, selected_day, start_day, end_day)

    activities = repositories.list_activities_for_day(user_email, selected_day)
    activity_ids = [task["id"] for task in activities]
    subtasks_map = repositories.list_todo_subtasks(activity_ids, user_email=user_email)

    if view_mode == "Week":
        if event_source == "google_api":
            google_counts = {}
            google_details = {}
            for event in day_events:
                google_counts[selected_day] = google_counts.get(selected_day, 0) + 1
                label = event.get("start_time") or "All day"
                line = f"{label} • {event['title']}"
                google_details[selected_day] = f"{google_details.get(selected_day, '')}<br>{line}".strip("<br>")
        else:
            ics_url, _ = ctx["helpers"]["get_user_calendar_ics_url"](user_email)
            all_events = []
            if ics_url:
                all_events, _ = ctx["helpers"]["fetch_ics_events_for_range"](
                    ics_url,
                    start_day,
                    end_day,
                )
            google_counts = ctx["helpers"]["build_event_count_map"](all_events, start_day, end_day)
            google_details = ctx["helpers"]["build_event_detail_map"](all_events, start_day, end_day)

        week_tasks = repositories.list_activities_for_range(user_email, start_day, end_day)
        task_counts = ctx["helpers"]["build_task_count_map"](week_tasks, start_day, end_day)
        task_details = ctx["helpers"]["build_task_detail_map"](week_tasks, start_day, end_day)

        score_map = {}
        data = ctx["data"]
        if not data.empty and "life_balance_score" in data.columns:
            for _, row in data.iterrows():
                row_date = row.get("date")
                if isinstance(row_date, date) and start_day <= row_date <= end_day:
                    score_map[row_date] = row.get("life_balance_score")

        st.markdown(
            ctx["helpers"]["build_week_calendar_html"](
                start_day,
                selected_day,
                google_counts,
                task_counts,
                google_details,
                task_details,
                score_map,
            ),
            unsafe_allow_html=True,
        )

    if events_error:
        st.warning(events_error)

    st.caption("Each activity change saves instantly. Draft is kept per date in current session.")

    draft = _draft_for_day(selected_day)
    st.markdown("<div class='small-label'>Add activity</div>", unsafe_allow_html=True)
    add_cols = st.columns([3, 1.4, 1.2, 1.1, 1.1, 0.8])
    with add_cols[0]:
        draft["title"] = st.text_input("Title", value=draft["title"], key=f"calendar.draft.title.{selected_day.isoformat()}")
    with add_cols[1]:
        draft["priority"] = st.selectbox(
            "Priority",
            PRIORITY_TAGS,
            index=PRIORITY_TAGS.index(draft.get("priority", "Medium")),
            key=f"calendar.draft.priority.{selected_day.isoformat()}",
        )
    with add_cols[2]:
        draft["estimated_minutes"] = st.number_input(
            "Est min",
            min_value=5,
            max_value=600,
            step=5,
            value=int(draft.get("estimated_minutes", 30) or 30),
            key=f"calendar.draft.est.{selected_day.isoformat()}",
        )
    with add_cols[3]:
        draft["has_time"] = st.checkbox("Time", value=bool(draft.get("has_time", False)), key=f"calendar.draft.time_flag.{selected_day.isoformat()}")
    with add_cols[4]:
        draft["time"] = st.time_input(
            "Start",
            value=draft.get("time") or datetime.now().replace(second=0, microsecond=0).time(),
            key=f"calendar.draft.time.{selected_day.isoformat()}",
            disabled=not draft.get("has_time", False),
        )
    with add_cols[5]:
        if st.button("+", key=f"calendar.add.{selected_day.isoformat()}", type="tertiary"):
            if not (draft.get("title") or "").strip():
                st.warning("Activity title is required.")
            else:
                repositories.save_activity(
                    {
                        "user_email": user_email,
                        "title": draft["title"],
                        "source": "manual",
                        "scheduled_date": selected_day,
                        "scheduled_time": draft.get("time") if draft.get("has_time") else None,
                        "priority_tag": draft.get("priority"),
                        "estimated_minutes": draft.get("estimated_minutes"),
                    }
                )
                draft["title"] = ""
                st.rerun()

    st.markdown("<div class='small-label'>Daily task list (calendar + manual)</div>", unsafe_allow_html=True)
    combined = []

    for event in day_events:
        combined.append(
            {
                "kind": "google_event",
                "id": event.get("event_key"),
                "title": event.get("title"),
                "time": event.get("start_time"),
                "calendar_id": event.get("calendar_id"),
                "event_id": event.get("event_id"),
            }
        )

    for activity in activities:
        combined.append(
            {
                "kind": "activity",
                "id": activity["id"],
                "title": activity["title"],
                "time": activity.get("scheduled_time"),
                "row": activity,
            }
        )

    combined.sort(key=lambda item: (item.get("time") is None, item.get("time") or "23:59", item.get("title") or ""))

    if not combined:
        st.caption("No events or activities for this date.")

    for item in combined:
        row_cols = st.columns([0.6, 3.8, 1.3, 1.2, 0.8, 0.8])
        task_key = str(item["id"]).replace(" ", "_").replace(":", "_")

        if item["kind"] == "google_event":
            with row_cols[0]:
                st.markdown("G")
            with row_cols[1]:
                label_time = item.get("time") or "All day"
                st.markdown(f"**{item['title']}** ({label_time})")
            with row_cols[2]:
                st.caption("Google")
            with row_cols[3]:
                if st.button("Import", key=f"calendar.import.{task_key}", type="tertiary"):
                    repositories.save_activity(
                        {
                            "user_email": user_email,
                            "title": item["title"],
                            "source": "calendar",
                            "scheduled_date": selected_day,
                            "scheduled_time": item.get("time"),
                            "priority_tag": "Medium",
                            "estimated_minutes": 30,
                            "google_calendar_id": item.get("calendar_id"),
                            "google_event_id": item.get("event_id"),
                        }
                    )
                    st.rerun()
            with row_cols[4]:
                if item.get("calendar_id") and item.get("event_id") and st.button("✎", key=f"calendar.edit.g.{task_key}", type="tertiary"):
                    st.session_state[f"calendar.edit_google.{task_key}"] = True
            with row_cols[5]:
                if item.get("calendar_id") and item.get("event_id") and st.button("✕", key=f"calendar.delete.g.{task_key}", type="tertiary"):
                    try:
                        google_calendar.google_delete_event(user_email, item["calendar_id"], item["event_id"])
                        st.rerun()
                    except Exception as exc:
                        st.warning(f"Failed to delete Google event: {exc}")

            if st.session_state.get(f"calendar.edit_google.{task_key}"):
                edit_cols = st.columns([3, 1.2, 1.2, 1.0])
                with edit_cols[0]:
                    new_title = st.text_input("Title", value=item["title"], key=f"calendar.google.title.{task_key}")
                with edit_cols[1]:
                    new_time = st.time_input(
                        "Start",
                        value=datetime.strptime(item.get("time") or "09:00", "%H:%M").time() if item.get("time") else datetime.now().replace(second=0, microsecond=0).time(),
                        key=f"calendar.google.time.{task_key}",
                    )
                with edit_cols[2]:
                    if st.button("Update", key=f"calendar.google.update.{task_key}", type="tertiary"):
                        try:
                            start_obj = datetime.combine(selected_day, new_time)
                            end_obj = start_obj + timedelta(minutes=30)
                            start_dt = start_obj.isoformat()
                            end_dt = end_obj.isoformat()
                            google_calendar.google_update_event(
                                user_email,
                                item["calendar_id"],
                                item["event_id"],
                                {
                                    "summary": new_title,
                                    "start": {"dateTime": start_dt},
                                    "end": {"dateTime": end_dt},
                                },
                            )
                            st.session_state[f"calendar.edit_google.{task_key}"] = False
                            st.rerun()
                        except Exception as exc:
                            st.warning(f"Failed to update Google event: {exc}")
                with edit_cols[3]:
                    if st.button("Close", key=f"calendar.google.close.{task_key}", type="tertiary"):
                        st.session_state[f"calendar.edit_google.{task_key}"] = False
                        st.rerun()

            st.divider()
            continue

        row = item["row"]
        with row_cols[0]:
            done_key = f"calendar.done.{task_key}"
            checked = st.checkbox("", value=bool(row.get("is_done", 0)), key=done_key, label_visibility="collapsed")
            if checked != bool(row.get("is_done", 0)):
                repositories.save_activity({"id": row["id"], "is_done": int(checked)})
                st.rerun()
        with row_cols[1]:
            label_time = row.get("scheduled_time") or "No time"
            st.markdown(f"**{row['title']}** ({label_time})")
        with row_cols[2]:
            priority = row.get("priority_tag") or "Medium"
            idx = PRIORITY_TAGS.index(priority) if priority in PRIORITY_TAGS else 1
            updated_priority = st.selectbox("Priority", PRIORITY_TAGS, index=idx, key=f"calendar.priority.{task_key}")
            if updated_priority != priority:
                repositories.save_activity({"id": row["id"], "priority_tag": updated_priority})
                st.rerun()
        with row_cols[3]:
            est = int(row.get("estimated_minutes") or 0)
            updated_est = st.number_input("Est", min_value=0, max_value=600, step=5, value=est, key=f"calendar.est.{task_key}")
            if int(updated_est) != est:
                repositories.save_activity({"id": row["id"], "estimated_minutes": int(updated_est)})
                st.rerun()
        with row_cols[4]:
            if st.button("✎", key=f"calendar.rename.{task_key}", type="tertiary"):
                st.session_state[f"calendar.renaming.{task_key}"] = True
        with row_cols[5]:
            if st.button("✕", key=f"calendar.delete.{task_key}", type="tertiary"):
                try:
                    repositories.delete_activity(row["id"], delete_remote_google=True)
                    st.rerun()
                except Exception as exc:
                    st.warning(f"Delete failed: {exc}")

        if st.session_state.get(f"calendar.renaming.{task_key}"):
            rename_cols = st.columns([3, 1])
            with rename_cols[0]:
                new_name = st.text_input("Rename", value=row["title"], key=f"calendar.rename.input.{task_key}")
            with rename_cols[1]:
                if st.button("Save", key=f"calendar.rename.save.{task_key}", type="tertiary"):
                    repositories.save_activity({"id": row["id"], "title": new_name})
                    st.session_state[f"calendar.renaming.{task_key}"] = False
                    st.rerun()

        subtasks = subtasks_map.get(row["id"], [])
        for sub in subtasks:
            sub_cols = st.columns([0.6, 3.4, 1.2, 0.8])
            sub_key = sub["id"]
            with sub_cols[0]:
                sub_done = st.checkbox("", value=bool(sub.get("is_done", 0)), key=f"calendar.sub.done.{sub_key}", label_visibility="collapsed")
                if sub_done != bool(sub.get("is_done", 0)):
                    repositories.update_subtask(sub_key, {"is_done": sub_done})
                    st.rerun()
            with sub_cols[1]:
                st.caption(f"Subtask: {sub['title']}")
            with sub_cols[2]:
                actual = int(sub.get("actual_minutes") or 0)
                actual_new = st.number_input("Actual", min_value=0, max_value=600, step=5, value=actual, key=f"calendar.sub.actual.{sub_key}")
                if actual_new != actual:
                    repositories.update_subtask(sub_key, {"actual_minutes": int(actual_new)})
                    st.rerun()
            with sub_cols[3]:
                if st.button("✕", key=f"calendar.sub.delete.{sub_key}", type="tertiary"):
                    repositories.delete_subtask(sub_key)
                    st.rerun()

        add_sub_cols = st.columns([3.6, 1.2, 0.8])
        with add_sub_cols[0]:
            sub_title = st.text_input("New subtask", key=f"calendar.sub.new.{task_key}", label_visibility="collapsed", placeholder="Add subtask")
        with add_sub_cols[1]:
            sub_est = st.number_input("Est", min_value=5, max_value=600, step=5, value=15, key=f"calendar.sub.est.{task_key}")
        with add_sub_cols[2]:
            if st.button("+", key=f"calendar.sub.add.{task_key}", type="tertiary"):
                repositories.add_subtask(row["id"], sub_title, estimated_minutes=sub_est)
                st.rerun()

        st.divider()
