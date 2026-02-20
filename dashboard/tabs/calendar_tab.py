import threading
import time
from datetime import date, datetime, timedelta

import pandas as pd
import streamlit as st

from dashboard.data import repositories
from dashboard.data import api_client
from dashboard.services import google_calendar
from dashboard.state import session_slices


PRIORITY_TAGS = ["High", "Medium", "Low"]


def _get_calendar_ids(ctx, user_email):
    primary = "primary"
    secret_getter = ctx["helpers"]["get_secret"]

    if user_email == ctx["constants"]["JAHDY_EMAIL"]:
        raw = secret_getter(("app", "JAHDY_GOOGLE_ALLOWED_CALENDAR_IDS"), "") or secret_getter(("JAHDY_GOOGLE_ALLOWED_CALENDAR_IDS",), "")
    elif user_email == ctx["constants"]["GUILHERME_EMAIL"]:
        raw = secret_getter(("app", "GUILHERME_GOOGLE_ALLOWED_CALENDAR_IDS"), "") or secret_getter(("GUILHERME_GOOGLE_ALLOWED_CALENDAR_IDS",), "")
    else:
        raw = ""

    extra = [item.strip() for item in str(raw).split(",") if item.strip()]
    calendar_ids = [primary] + [item for item in extra if item and item != primary]
    # Keep stable ordering and remove duplicates.
    dedup = []
    seen = set()
    for item in calendar_ids:
        if item in seen:
            continue
        seen.add(item)
        dedup.append(item)
    return dedup


def _handle_google_oauth_callback(user_email):
    params = st.query_params
    code = params.get("code")
    state = params.get("state")
    if not code:
        return
    try:
        if not state or str(state).split("|")[0] != user_email:
            st.warning("Google callback ignored (state mismatch).")
            return
        google_calendar.connect_from_code(user_email, str(code))
        st.success("Google Calendar connected.")
    except Exception as exc:
        st.warning(f"Google Calendar connection failed: {exc}")
    finally:
        st.query_params.clear()
        st.rerun()


def _render_diagnostics(connected):
    st.markdown("<div class='small-label'>Google Calendar diagnostics</div>", unsafe_allow_html=True)
    state = "Connected" if connected else "Not connected"
    st.caption(f"State: {state}")
    st.caption(f"Calendar redirect URI in use: {google_calendar.get_effective_redirect_uri()}")
    if not connected:
        st.warning(
            "Google Calendar sync is currently disabled. You can still use local tasks; connect Google to enable bi-directional sync."
        )
        st.caption(
            "If Google returns redirect_uri_mismatch, confirm this URI is added in Google Cloud OAuth as an Authorized redirect URI."
        )


def _range_from_view(selected_day, view_mode, week_ref, month_ref, month_last_day):
    if view_mode == "Week":
        start_day = week_ref - timedelta(days=week_ref.weekday())
        end_day = start_day + timedelta(days=6)
    else:
        start_day = month_ref.replace(day=1)
        end_day = month_last_day(start_day)
    return start_day, end_day


def _day_draft(selected_day):
    slice_obj = session_slices.get_slice("calendar")
    drafts = slice_obj.setdefault("drafts_by_date", {})
    day_key = selected_day.isoformat()
    if day_key not in drafts:
        drafts[day_key] = {
            "title": "",
            "priority": "Medium",
            "estimated": 30,
            "has_time": False,
            "time": datetime.now().replace(second=0, microsecond=0).time(),
        }
    return drafts[day_key]


def _build_week_hour_board(range_tasks, start_day):
    columns = [(start_day + timedelta(days=i)) for i in range(7)]
    index = {}
    for item in range_tasks:
        day_key = item.get("scheduled_date")
        item_time = item.get("scheduled_time")
        if not day_key or not item_time:
            continue
        hour_key = str(item_time)[:2]
        index.setdefault((day_key, hour_key), []).append(f"{item_time} • {item.get('title')}")

    hour_rows = []
    for hour in range(0, 24):
        hour_label = f"{hour:02d}"
        row = {"Hour": f"{hour_label}:00"}
        for day in columns:
            day_iso = day.isoformat()
            day_key = day.strftime("%a %d/%m")
            values = index.get((day_iso, hour_label), [])
            row[day_key] = " | ".join(values)
        hour_rows.append(row)
    return hour_rows


def _sync_google_if_connected(user_email, connected, start_day, end_day, calendar_ids):
    if not connected:
        return []
    sync_key = f"{user_email}:{start_day.isoformat()}:{end_day.isoformat()}:{','.join(calendar_ids)}"
    now = time.monotonic()
    last_sync_key = st.session_state.get("calendar.last_sync_key")
    last_sync_ts = float(st.session_state.get("calendar.last_sync_ts", 0.0) or 0.0)
    if last_sync_key == sync_key and (now - last_sync_ts) < 20:
        return []
    try:
        if api_client.is_enabled():
            def _fire_sync():
                try:
                    api_client.request("POST", "/v1/calendar/sync/run")
                except Exception:
                    pass
            threading.Thread(target=_fire_sync, daemon=True).start()
            st.session_state["calendar.last_sync_key"] = sync_key
            st.session_state["calendar.last_sync_ts"] = now
            return []
        events = repositories.sync_google_events_for_range(user_email, start_day, end_day, calendar_ids)
        st.session_state["calendar.last_sync_key"] = sync_key
        st.session_state["calendar.last_sync_ts"] = now
        return events
    except Exception as exc:
        st.warning(f"Google sync failed: {exc}")
        return []


def _sync_created_or_updated_activity_to_google(user_email, activity_id, connected, primary_calendar_id):
    if not connected:
        return
    if api_client.is_enabled():
        def _fire_outbox():
            try:
                api_client.request("POST", "/v1/sync/run")
            except Exception:
                pass
        threading.Thread(target=_fire_outbox, daemon=True).start()
        return
    activity = repositories.get_activity_by_id(activity_id, user_email=user_email)
    if not activity:
        return
    if activity.get("google_calendar_id") and activity.get("google_event_id"):
        repositories.update_google_event_for_activity(user_email, activity_id)
    else:
        repositories.create_google_event_for_activity(user_email, activity_id, primary_calendar_id)


def render_calendar_tab(ctx):
    user_email = ctx["current_user_email"]
    month_last_day = ctx["helpers"]["month_last_day"]

    _handle_google_oauth_callback(user_email)

    connected = google_calendar.is_connected(user_email)
    calendar_ids = _get_calendar_ids(ctx, user_email)
    primary_calendar_id = calendar_ids[0]

    st.markdown("<div class='section-title'>Calendar & Activities</div>", unsafe_allow_html=True)

    top = st.columns([2.2, 1.2, 2.2, 1.4])
    with top[0]:
        selected_day = st.date_input("Selected day", key="calendar.selected_day", value=date.today())
    with top[1]:
        view_mode = st.selectbox("View", ["Week", "Month"], index=0, key="calendar.view_mode")
    with top[2]:
        week_ref = st.date_input("Week reference", value=selected_day, key="calendar.week_ref")
        month_ref = st.date_input("Month reference", value=selected_day.replace(day=1), key="calendar.month_ref")
    with top[3]:
        connect_url = ""
        try:
            connect_url, _ = google_calendar.build_connect_url(user_email)
        except Exception:
            connect_url = ""
        if connect_url:
            st.link_button("Connect Calendar", connect_url, use_container_width=True)
        else:
            st.caption("Calendar OAuth is not configured in backend secrets.")

    start_day, end_day = _range_from_view(selected_day, view_mode, week_ref, month_ref, month_last_day)

    _sync_google_if_connected(user_email, connected, start_day, end_day, calendar_ids)

    cache_key = f"{user_email}:{start_day.isoformat()}:{end_day.isoformat()}"
    force_refresh = bool(st.session_state.get("calendar.force_refresh", False))
    cached = st.session_state.get("calendar.range_cache", {})
    if (not force_refresh) and cached.get("key") == cache_key:
        range_tasks = cached.get("items", [])
        subtasks = cached.get("subtasks", {})
    else:
        if api_client.is_enabled():
            try:
                payload = api_client.request(
                    "GET",
                    "/v1/tasks",
                    params={"start": start_day.isoformat(), "end": end_day.isoformat()},
                )
                range_tasks = payload.get("items", [])
                subtasks = payload.get("subtasks", {})
            except Exception:
                range_tasks = repositories.list_activities_for_range(user_email, start_day, end_day)
                subtasks = repositories.list_todo_subtasks([item["id"] for item in range_tasks], user_email=user_email)
        else:
            range_tasks = repositories.list_activities_for_range(user_email, start_day, end_day)
            subtasks = repositories.list_todo_subtasks([item["id"] for item in range_tasks], user_email=user_email)
        st.session_state["calendar.range_cache"] = {"key": cache_key, "items": range_tasks, "subtasks": subtasks}
        st.session_state["calendar.force_refresh"] = False

    day_tasks = [item for item in range_tasks if item.get("scheduled_date") == selected_day.isoformat()]

    st.markdown("<div class='small-label'>Open calendar view</div>", unsafe_allow_html=True)
    if view_mode == "Week":
        week_hour_rows = _build_week_hour_board(range_tasks, start_day)
        st.caption("Hourly schedule")
        st.dataframe(pd.DataFrame(week_hour_rows), use_container_width=True, hide_index=True)
    else:
        month_rows = []
        day = start_day
        while day <= end_day:
            day_items = [item for item in range_tasks if item.get("scheduled_date") == day.isoformat()]
            month_rows.append(
                {
                    "Date": day.strftime("%d/%m/%Y"),
                    "Tasks": len(day_items),
                    "Preview": " | ".join(
                        [
                            f"{(item.get('scheduled_time') or 'All day')} • {item.get('title')}"
                            for item in day_items[:4]
                        ]
                    ),
                }
            )
            day += timedelta(days=1)
        st.dataframe(pd.DataFrame(month_rows), use_container_width=True, hide_index=True)

    st.markdown("<div class='small-label'>Add activity</div>", unsafe_allow_html=True)
    draft = _day_draft(selected_day)
    add_prefix = selected_day.isoformat()
    add_title_key = f"calendar.add.title.{add_prefix}"
    add_priority_key = f"calendar.add.priority.{add_prefix}"
    add_est_key = f"calendar.add.est.{add_prefix}"
    add_has_time_key = f"calendar.add.has_time.{add_prefix}"
    add_time_key = f"calendar.add.time.{add_prefix}"
    if add_title_key not in st.session_state:
        st.session_state[add_title_key] = draft["title"]
    if add_priority_key not in st.session_state:
        st.session_state[add_priority_key] = draft["priority"]
    if add_est_key not in st.session_state:
        st.session_state[add_est_key] = int(draft["estimated"])
    if add_has_time_key not in st.session_state:
        st.session_state[add_has_time_key] = bool(draft["has_time"])
    if add_time_key not in st.session_state:
        st.session_state[add_time_key] = draft["time"]

    with st.form(key=f"calendar.add.form.{add_prefix}", clear_on_submit=True):
        add_cols = st.columns([3.2, 1.3, 1.1, 1.0, 1.1, 1.3])
        with add_cols[0]:
            st.text_input("Title", key=add_title_key)
        with add_cols[1]:
            st.selectbox("Priority", PRIORITY_TAGS, key=add_priority_key)
        with add_cols[2]:
            st.number_input("Est", min_value=5, max_value=600, step=5, key=add_est_key)
        with add_cols[3]:
            st.checkbox("Time", key=add_has_time_key)
        with add_cols[4]:
            st.time_input("Start", key=add_time_key, disabled=not bool(st.session_state.get(add_has_time_key)))
        with add_cols[5]:
            confirm_add = st.form_submit_button("Confirm task", use_container_width=True)

    if confirm_add:
        draft["title"] = st.session_state.get(add_title_key, "")
        draft["priority"] = st.session_state.get(add_priority_key, "Medium")
        draft["estimated"] = int(st.session_state.get(add_est_key, 30) or 30)
        draft["has_time"] = bool(st.session_state.get(add_has_time_key, False))
        draft["time"] = st.session_state.get(add_time_key, datetime.now().replace(second=0, microsecond=0).time())

        if not (draft["title"] or "").strip():
            st.warning("Task title is required.")
        else:
            created = repositories.save_activity(
                {
                    "user_email": user_email,
                    "title": draft["title"],
                    "source": "manual",
                    "scheduled_date": selected_day,
                    "scheduled_time": draft["time"] if draft["has_time"] else None,
                    "priority_tag": draft["priority"],
                    "estimated_minutes": draft["estimated"],
                }
            )
            try:
                _sync_created_or_updated_activity_to_google(user_email, created["id"], connected, primary_calendar_id)
            except Exception as exc:
                st.warning(f"Saved locally, but Google sync failed: {exc}")
            draft["title"] = ""
            st.session_state["calendar.force_refresh"] = True
            st.rerun()

    st.markdown("<div class='small-label' style='margin-top:8px;'>Remembered tasks (to decide)</div>", unsafe_allow_html=True)
    with st.form(key="calendar.remembered.form", clear_on_submit=False):
        rem_cols = st.columns([3.2, 1.3, 1.1, 1.3])
        with rem_cols[0]:
            st.text_input("Remembered task", key="calendar.remembered.title", placeholder="Something to do later")
        with rem_cols[1]:
            st.selectbox("Priority", PRIORITY_TAGS, key="calendar.remembered.priority")
        with rem_cols[2]:
            st.number_input("Est", min_value=5, max_value=600, step=5, value=20, key="calendar.remembered.est")
        with rem_cols[3]:
            confirm_remembered = st.form_submit_button("Confirm remembered", use_container_width=True)

    if confirm_remembered:
        title = (st.session_state.get("calendar.remembered.title") or "").strip()
        if not title:
            st.warning("Remembered task title is required.")
        else:
            repositories.save_activity(
                {
                    "user_email": user_email,
                    "title": title,
                    "source": "remembered",
                    "priority_tag": st.session_state.get("calendar.remembered.priority", "Medium"),
                    "estimated_minutes": int(st.session_state.get("calendar.remembered.est", 20) or 20),
                }
            )
            st.session_state["calendar.remembered.title"] = ""
            st.session_state["calendar.force_refresh"] = True
            st.rerun()

    if api_client.is_enabled():
        try:
            unscheduled = api_client.request("GET", "/v1/tasks/unscheduled").get("items", [])
        except Exception:
            unscheduled = repositories.list_unscheduled_remembered(user_email)
    else:
        unscheduled = repositories.list_unscheduled_remembered(user_email)
    if not unscheduled:
        st.caption("No remembered tasks pending scheduling.")
    else:
        for task in unscheduled:
            task_id = task["id"]
            task_key = task_id.replace("-", "_")
            st.markdown(f"**{task.get('title')}**")
            with st.form(key=f"calendar.rem.plan.form.{task_key}", clear_on_submit=False):
                sch_cols = st.columns([1.6, 1.2, 1.0, 1.0, 1.1, 0.8])
                with sch_cols[0]:
                    plan_date = st.date_input("Date", value=selected_day, key=f"calendar.rem.plan.date.{task_key}")
                with sch_cols[1]:
                    has_time = st.checkbox("Time", value=False, key=f"calendar.rem.plan.timeflag.{task_key}")
                with sch_cols[2]:
                    plan_time = st.time_input(
                        "Start",
                        value=datetime.now().replace(second=0, microsecond=0).time(),
                        key=f"calendar.rem.plan.time.{task_key}",
                        disabled=not has_time,
                    )
                with sch_cols[3]:
                    plan_priority = st.selectbox(
                        "Priority",
                        PRIORITY_TAGS,
                        index=PRIORITY_TAGS.index(task.get("priority_tag") or "Medium") if task.get("priority_tag") in PRIORITY_TAGS else 1,
                        key=f"calendar.rem.plan.priority.{task_key}",
                    )
                with sch_cols[4]:
                    schedule_now = st.form_submit_button("Confirm schedule", use_container_width=True)
                with sch_cols[5]:
                    delete_remembered = st.form_submit_button("✕", use_container_width=True)

            if schedule_now:
                repositories.save_activity(
                    {
                        "id": task_id,
                        "priority_tag": plan_priority,
                    }
                )
                repositories.schedule_remembered_task(task_id, plan_date, plan_time if has_time else None)
                try:
                    _sync_created_or_updated_activity_to_google(user_email, task_id, connected, primary_calendar_id)
                except Exception as exc:
                    st.warning(f"Scheduled locally, but Google sync failed: {exc}")
                st.session_state["calendar.force_refresh"] = True
                st.rerun()
            if delete_remembered:
                repositories.delete_activity(task_id, delete_remote_google=False)
                st.session_state["calendar.force_refresh"] = True
                st.rerun()
            st.divider()

    st.markdown("<div class='calendar-compact'>", unsafe_allow_html=True)
    st.markdown("<div class='small-label' style='margin-top:8px;'>Daily tasks list</div>", unsafe_allow_html=True)
    if not day_tasks:
        st.caption("No local tasks for this day.")

    for task_idx, task in enumerate(day_tasks, start=1):
        task_id = task["id"]
        task_key = task_id.replace("-", "_")
        time_current = task.get("scheduled_time")
        default_time = (
            datetime.strptime(time_current, "%H:%M").time()
            if time_current
            else datetime.now().replace(second=0, microsecond=0).time()
        )

        row = st.columns([0.6, 6.0, 1.2, 0.8])
        with row[0]:
            checked = st.checkbox(
                "",
                value=bool(task.get("is_done", 0)),
                key=f"calendar.task.done.{task_key}",
                label_visibility="collapsed",
            )
        with row[1]:
            new_title = st.text_input(
                "Title",
                value=task.get("title") or "",
                key=f"calendar.task.title.{task_key}",
                label_visibility="collapsed",
            )
        with row[2]:
            time_badge = task.get("scheduled_time") or "All day"
            st.caption(time_badge)
        with row[3]:
            delete_task = st.button("✕", key=f"calendar.task.delete.{task_key}")

        # Auto-save for main task (minimal fields only)
        auto_key = f"calendar.task.autosave.{task_key}"
        current_snapshot = (bool(checked), (new_title or "").strip(), time_badge)
        last_snapshot = st.session_state.get(auto_key)
        if last_snapshot is not None and last_snapshot != current_snapshot:
            final_title = (new_title or "").strip() or (task.get("title") or "Untitled task")
            patch = {
                "id": task_id,
                "is_done": int(bool(checked)),
                "title": final_title,
            }
            repositories.save_activity(patch)
            st.session_state["calendar.force_refresh"] = True
        st.session_state[auto_key] = current_snapshot

        with st.expander(f"Details · {task_idx}", expanded=False):
            # Subtasks only (compact list)
            sub_items = subtasks.get(task_id, [])
            for sub_idx, sub in enumerate(sub_items, start=1):
                sub_key = sub["id"].replace("-", "_")
                sub_row = st.columns([0.6, 7.2, 0.8])
                with sub_row[0]:
                    s_done = st.checkbox(
                        "",
                        value=bool(sub.get("is_done", 0)),
                        key=f"calendar.sub.done.{sub_key}",
                        label_visibility="collapsed",
                    )
                with sub_row[1]:
                    st.caption(f"{task_idx}.{sub_idx} · {sub.get('title') or ''}")
                with sub_row[2]:
                    delete_sub = st.button("✕", key=f"calendar.sub.delete.{sub_key}")

                if bool(sub.get("is_done", 0)) != bool(s_done):
                    repositories.update_subtask(sub["id"], {"is_done": s_done})
                    st.session_state["calendar.force_refresh"] = True
                if delete_sub:
                    repositories.delete_subtask(sub["id"])
                    st.session_state["calendar.force_refresh"] = True
                    st.rerun()

            add_sub_key = f"calendar.sub.new.{task_key}"
            sub_cols = st.columns([7.2, 0.8])
            with sub_cols[0]:
                sub_title = st.text_input(
                    "New subtask",
                    key=add_sub_key,
                    label_visibility="collapsed",
                    placeholder="Add subtask",
                )
            with sub_cols[1]:
                add_sub = st.button("Add", key=f"calendar.sub.add.{task_key}")

            if add_sub:
                clean_sub_title = (sub_title or "").strip()
                if clean_sub_title:
                    repositories.add_subtask(task_id, clean_sub_title, estimated_minutes=15)
                    st.session_state[add_sub_key] = ""
                    st.session_state["calendar.force_refresh"] = True
                    st.rerun()

        if delete_task:
            repositories.delete_activity(task_id, delete_remote_google=True)
            st.session_state["calendar.force_refresh"] = True
            st.rerun()

        st.divider()

    st.markdown("</div>", unsafe_allow_html=True)
    st.divider()
    st.caption(f"Range: {start_day.strftime('%d/%m/%Y')} - {end_day.strftime('%d/%m/%Y')}")
    _render_diagnostics(connected)
