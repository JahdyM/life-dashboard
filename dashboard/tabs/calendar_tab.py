import threading
import time
from datetime import date, datetime, timedelta

import pandas as pd
import streamlit as st

from dashboard.data import repositories
from dashboard.data import api_client
from dashboard.services import google_calendar
from dashboard.state import session_slices

try:
    from streamlit_calendar import calendar as st_calendar
except Exception:
    st_calendar = None


PRIORITY_TAGS = ["High", "Medium", "Low"]
PRIORITY_COLORS = {
    "High": "#D95252",
    "Medium": "#8FB6D9",
    "Low": "#3772A6",
}


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
    if view_mode == "Day":
        start_day = selected_day
        end_day = selected_day
    elif view_mode == "Week":
        start_day = week_ref - timedelta(days=week_ref.weekday())
        end_day = start_day + timedelta(days=6)
    else:
        start_day = month_ref.replace(day=1)
        end_day = month_last_day(start_day)
    return start_day, end_day


def _build_day_hour_board(day_tasks):
    index = {f"{hour:02d}": [] for hour in range(0, 24)}
    for item in day_tasks:
        item_time = item.get("scheduled_time")
        if not item_time:
            continue
        hour_key = str(item_time)[:2]
        index.setdefault(hour_key, []).append(f"{item_time} • {item.get('title')}")
    rows = []
    for hour in range(0, 24):
        hour_key = f"{hour:02d}"
        rows.append((f"{hour_key}:00", " | ".join(index.get(hour_key, []))))
    return rows


def _day_draft(selected_day):
    slice_obj = session_slices.get_slice("calendar")
    drafts = slice_obj.setdefault("drafts_by_date", {})
    day_key = selected_day.isoformat()
    if day_key not in drafts:
        drafts[day_key] = {
            "title": "",
            "priority": "Medium",
            "estimated": 30,
            "date": "",
            "time": "",
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


def _parse_iso_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    raw = str(value)
    try:
        if raw.endswith("Z"):
            raw = raw.replace("Z", "+00:00")
        return datetime.fromisoformat(raw)
    except ValueError:
        try:
            return datetime.strptime(raw, "%Y-%m-%d")
        except ValueError:
            return None


def _build_calendar_events(tasks):
    events = []
    for item in tasks:
        title = (item.get("title") or "Untitled").strip()
        task_id = item.get("id")
        scheduled_date = item.get("scheduled_date")
        scheduled_time = item.get("scheduled_time")
        priority = item.get("priority_tag") or "Medium"
        color = PRIORITY_COLORS.get(priority, "#8FB6D9")
        if scheduled_time:
            start = f"{scheduled_date}T{scheduled_time}"
            est = int(item.get("estimated_minutes") or 30)
            end_dt = _parse_iso_datetime(start)
            if end_dt:
                end_dt = end_dt + timedelta(minutes=max(est, 15))
                end = end_dt.isoformat()
            else:
                end = None
            events.append(
                {
                    "id": task_id,
                    "title": title,
                    "start": start,
                    "end": end,
                    "allDay": False,
                    "backgroundColor": color,
                    "borderColor": color,
                }
            )
    return events


def _sync_google_if_connected(user_email, connected, start_day, end_day, calendar_ids, force=False):
    if not connected:
        st.session_state["calendar.sync_status"] = "Idle"
        st.session_state["calendar.sync_error"] = ""
        return []
    sync_key = f"{user_email}:{start_day.isoformat()}:{end_day.isoformat()}:{','.join(calendar_ids)}"
    now = time.monotonic()
    last_sync_key = st.session_state.get("calendar.last_sync_key")
    last_sync_ts = float(st.session_state.get("calendar.last_sync_ts", 0.0) or 0.0)
    if (not force) and last_sync_key == sync_key and (now - last_sync_ts) < 60:
        return []
    try:
        st.session_state["calendar.sync_status"] = "Syncing"
        st.session_state["calendar.sync_started"] = time.time()
        st.session_state["calendar.sync_error"] = ""
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
        st.session_state["calendar.sync_status"] = "Idle"
        return events
    except Exception as exc:
        st.session_state["calendar.sync_status"] = "Failed"
        st.session_state["calendar.sync_error"] = str(exc)
        st.warning(f"Google sync failed: {exc}")
        return []


def _sync_created_or_updated_activity_to_google(user_email, activity_id, connected, primary_calendar_id):
    if not connected:
        return
    if api_client.is_enabled():
        cooldown_until = float(st.session_state.get("calendar.sync_cooldown_until", 0.0) or 0.0)
        if time.time() < cooldown_until:
            st.session_state["calendar.sync_status"] = "Idle"
            return
        try:
            last_push = float(st.session_state.get("calendar.last_push_sync_ts", 0.0) or 0.0)
            if time.time() - last_push < 20:
                return
            st.session_state["calendar.sync_status"] = "Syncing"
            st.session_state["calendar.sync_error"] = ""
            api_client.request("POST", "/v1/sync/run")
            st.session_state["calendar.sync_status"] = "Idle"
            st.session_state["calendar.last_push_sync_ts"] = time.time()
        except Exception as exc:
            st.session_state["calendar.sync_status"] = "Failed"
            st.session_state["calendar.sync_error"] = str(exc)
            if "429" in str(exc):
                st.session_state["calendar.sync_cooldown_until"] = time.time() + 30
            raise
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

    st.markdown("<div class='calendar-top'>", unsafe_allow_html=True)
    sync_status = st.session_state.get("calendar.sync_status", "Idle")
    sync_error = st.session_state.get("calendar.sync_error", "")
    sync_started = st.session_state.get("calendar.sync_started")
    cooldown_until = float(st.session_state.get("calendar.sync_cooldown_until", 0.0) or 0.0)
    if sync_status == "Syncing" and sync_started:
        try:
            if time.time() - float(sync_started) > 8:
                st.session_state["calendar.sync_status"] = "Idle"
                sync_status = "Idle"
        except Exception:
            pass

    top = st.columns([1.2, 0.8, 1.0, 1.0, 0.75, 0.75])
    with top[0]:
        selected_day = st.date_input("Day", key="calendar.selected_day", value=date.today())
    with top[1]:
        view_mode = st.selectbox("View", ["Day", "Week", "Month"], index=0, key="calendar.view_mode")
    with top[2]:
        week_ref = st.date_input(
            "Week ref",
            value=selected_day,
            key="calendar.week_ref",
            label_visibility="visible",
            disabled=view_mode != "Week",
        )
    with top[3]:
        month_ref = st.date_input(
            "Month ref",
            value=selected_day.replace(day=1),
            key="calendar.month_ref",
            label_visibility="visible",
            disabled=view_mode != "Month",
        )
    with top[4]:
        if st.button("Sync now", key="calendar.sync_now", use_container_width=True, type="primary"):
            if time.time() < cooldown_until:
                st.session_state["calendar.sync_status"] = "Failed"
                st.session_state["calendar.sync_error"] = "Rate limited. Please wait a few seconds."
            else:
                st.session_state["calendar.force_sync"] = True
        if time.time() < cooldown_until:
            wait = int(cooldown_until - time.time())
            st.caption(f"Status: Rate limited ({wait}s)")
        else:
            st.caption(f"Status: {sync_status}")
    with top[5]:
        connect_url = ""
        try:
            connect_url, _ = google_calendar.build_connect_url(user_email)
        except Exception:
            connect_url = ""
        if connect_url:
            st.link_button("Connect", connect_url, use_container_width=True)
        else:
            st.caption("Calendar OAuth is not configured in backend secrets.")
    st.markdown("</div>", unsafe_allow_html=True)
    if sync_status == "Failed":
        st.warning("Couldn't update Google Calendar. Retry or check permissions.")
        if sync_error:
            st.caption(sync_error)

    start_day, end_day = _range_from_view(selected_day, view_mode, week_ref, month_ref, month_last_day)

    force_sync = bool(st.session_state.pop("calendar.force_sync", False))
    _sync_google_if_connected(user_email, connected, start_day, end_day, calendar_ids, force=force_sync)

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

    layout = st.columns([2.4, 1.0], gap="large")

    with layout[0]:
        st.markdown("<div class='calendar-compact task-list calendar-hacker'>", unsafe_allow_html=True)
        st.markdown("<div class='calendar-section-title'>Daily tasks list</div>", unsafe_allow_html=True)
        pending_tasks = [item for item in day_tasks if int(item.get("is_done", 0) or 0) == 0]
        done_tasks = [item for item in day_tasks if int(item.get("is_done", 0) or 0) == 1]
        planned_count = len(day_tasks)
        done_count = len(done_tasks)
        percent_done = round((done_count / planned_count) * 100) if planned_count else 0
        st.caption(f"{done_count}/{planned_count} done • {percent_done}% completed")
        if not pending_tasks:
            st.caption("No local tasks for this day.")

        for task_idx, task in enumerate(pending_tasks, start=1):
            task_id = task["id"]
            task_key = task_id.replace("-", "_")
            time_current = task.get("scheduled_time")
            default_time = (
                datetime.strptime(time_current, "%H:%M").time()
                if time_current
                else datetime.now().replace(second=0, microsecond=0).time()
            )

            open_key = f"calendar.task.open.{task_key}"
            if open_key not in st.session_state:
                st.session_state[open_key] = False

            row = st.columns([0.45, 7.6, 0.9])
            with row[0]:
                checked = st.checkbox(
                    "",
                    value=bool(task.get("is_done", 0)),
                    key=f"calendar.task.done.{task_key}",
                    label_visibility="collapsed",
                )
            with row[1]:
                task_title = (task.get("title") or "Untitled task").strip()
                st.markdown("<div class='task-title-btn'>", unsafe_allow_html=True)
                if st.button(task_title, key=f"calendar.task.openbtn.{task_key}"):
                    st.session_state[open_key] = not st.session_state[open_key]
                st.markdown("</div>", unsafe_allow_html=True)
            with row[2]:
                time_badge = task.get("scheduled_time") or ""
                if time_badge:
                    st.markdown(f"<div class='task-time'>{time_badge}</div>", unsafe_allow_html=True)

            # Auto-save for main task (minimal fields only)
            auto_key = f"calendar.task.autosave.{task_key}"
            current_snapshot = bool(checked)
            last_snapshot = st.session_state.get(auto_key)
            if last_snapshot is not None and last_snapshot != current_snapshot:
                patch = {
                    "id": task_id,
                    "is_done": int(bool(checked)),
                }
                repositories.save_activity(patch)
                st.session_state["calendar.force_refresh"] = True
            st.session_state[auto_key] = current_snapshot

            if st.session_state.get(open_key):
                with st.container():
                    st.markdown("<div class='task-details'>", unsafe_allow_html=True)
                    with st.form(key=f"calendar.task.form.{task_key}", clear_on_submit=False):
                        edit_cols = st.columns([1.2, 1.1, 1.1, 1.2, 1.4])
                        with edit_cols[0]:
                            current_pr = task.get("priority_tag") or "Medium"
                            pr = st.selectbox(
                                "Priority",
                                PRIORITY_TAGS,
                                index=PRIORITY_TAGS.index(current_pr) if current_pr in PRIORITY_TAGS else 1,
                                key=f"calendar.task.priority.{task_key}",
                            )
                        with edit_cols[1]:
                            est_current = int(task.get("estimated_minutes") or 0)
                            est_new = st.number_input(
                                "Est",
                                min_value=0,
                                max_value=600,
                                step=5,
                                value=est_current,
                                key=f"calendar.task.est.{task_key}",
                            )
                        with edit_cols[2]:
                            actual_current = int(task.get("actual_minutes") or 0)
                            actual_new = st.number_input(
                                "Actual",
                                min_value=0,
                                max_value=600,
                                step=5,
                                value=actual_current,
                                key=f"calendar.task.actual.{task_key}",
                            )
                        with edit_cols[3]:
                            has_time_new = st.checkbox(
                                "Time",
                                value=bool(task.get("scheduled_time")),
                                key=f"calendar.task.timeflag.{task_key}",
                            )
                        with edit_cols[4]:
                            if has_time_new:
                                time_new = st.time_input("Start", value=default_time, key=f"calendar.task.time.{task_key}")
                            else:
                                time_new = None
                        title_new = st.text_input(
                            "Title",
                            value=task_title,
                            key=f"calendar.task.title.edit.{task_key}",
                        )
                        save_task = st.form_submit_button("Save changes", use_container_width=True)

                    if save_task:
                        final_title = (title_new or "").strip() or task_title
                        final_time = time_new.strftime("%H:%M") if (has_time_new and time_new) else None
                        patch = {
                            "id": task_id,
                            "is_done": int(bool(checked)),
                            "title": final_title,
                            "priority_tag": pr,
                            "estimated_minutes": int(est_new),
                            "actual_minutes": int(actual_new),
                            "scheduled_time": final_time,
                        }
                        repositories.save_activity(patch)
                        try:
                            _sync_created_or_updated_activity_to_google(user_email, task_id, connected, primary_calendar_id)
                        except Exception as exc:
                            st.session_state["calendar.sync_status"] = "Failed"
                            st.session_state["calendar.sync_error"] = str(exc)
                            st.warning(f"Saved locally, but Google sync failed: {exc}")
                        st.session_state["calendar.force_refresh"] = True
                        st.rerun()

                    st.markdown("<div class='subtask-list'>", unsafe_allow_html=True)
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
                    st.markdown("</div>", unsafe_allow_html=True)

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

                    if st.button("Delete task", key=f"calendar.task.delete.{task_key}", type="tertiary"):
                        repositories.delete_activity(task_id, delete_remote_google=True)
                        st.session_state["calendar.force_refresh"] = True
                        st.rerun()

                    st.markdown("</div>", unsafe_allow_html=True)

        if done_tasks:
            st.markdown("<div class='calendar-section-title' style='margin-top:0.4rem;'>Completed</div>", unsafe_allow_html=True)
            for task_idx, task in enumerate(done_tasks, start=1):
                task_id = task["id"]
                task_key = task_id.replace("-", "_")
                open_key = f"calendar.task.open.{task_key}"
                if open_key not in st.session_state:
                    st.session_state[open_key] = False
                row = st.columns([0.45, 7.6, 0.9])
                with row[0]:
                    checked = st.checkbox(
                        "",
                        value=True,
                        key=f"calendar.task.done.done.{task_key}",
                        label_visibility="collapsed",
                    )
                with row[1]:
                    task_title = (task.get("title") or "Untitled task").strip()
                    st.markdown("<div class='task-title-btn'>", unsafe_allow_html=True)
                    if st.button(task_title, key=f"calendar.task.openbtn.done.{task_key}"):
                        st.session_state[open_key] = not st.session_state.get(open_key, False)
                    st.markdown("</div>", unsafe_allow_html=True)
                with row[2]:
                    time_badge = task.get("scheduled_time") or ""
                    if time_badge:
                        st.markdown(f"<div class='task-time'>{time_badge}</div>", unsafe_allow_html=True)

                auto_key = f"calendar.task.autosave.done.{task_key}"
                current_snapshot = bool(checked)
                last_snapshot = st.session_state.get(auto_key)
                if last_snapshot is not None and last_snapshot != current_snapshot:
                    patch = {"id": task_id, "is_done": int(bool(checked))}
                    repositories.save_activity(patch)
                    st.session_state["calendar.force_refresh"] = True
                    st.rerun()
                st.session_state[auto_key] = current_snapshot

        st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("<div class='calendar-compact calendar-hacker'>", unsafe_allow_html=True)
        st.markdown("<div class='calendar-section-title'>Add activity</div>", unsafe_allow_html=True)
        draft = _day_draft(selected_day)
        add_prefix = selected_day.isoformat()
        add_title_key = f"calendar.add.title.{add_prefix}"
        add_priority_key = f"calendar.add.priority.{add_prefix}"
        add_est_key = f"calendar.add.est.{add_prefix}"
        add_date_key = f"calendar.add.date.{add_prefix}"
        add_time_key = f"calendar.add.time.{add_prefix}"
        reset_key = f"calendar.add.reset.{add_prefix}"
        if st.session_state.pop(reset_key, False):
            for key in (add_title_key, add_priority_key, add_est_key, add_date_key, add_time_key):
                st.session_state.pop(key, None)
        if add_title_key not in st.session_state:
            st.session_state[add_title_key] = draft["title"]
        if add_priority_key not in st.session_state:
            st.session_state[add_priority_key] = draft["priority"]
        if add_est_key not in st.session_state:
            st.session_state[add_est_key] = int(draft["estimated"])
        if add_date_key not in st.session_state:
            st.session_state[add_date_key] = draft.get("date", "")
        if add_time_key not in st.session_state:
            st.session_state[add_time_key] = draft.get("time", "")

        with st.form(key=f"calendar.add.form.{add_prefix}", clear_on_submit=True):
            add_cols = st.columns([3.2, 1.0, 1.0, 1.3, 1.1, 1.0])
            with add_cols[0]:
                st.text_input("Title", key=add_title_key, placeholder="Task title", label_visibility="collapsed")
            with add_cols[1]:
                st.selectbox("Priority", PRIORITY_TAGS, key=add_priority_key, label_visibility="collapsed")
            with add_cols[2]:
                st.number_input("Est", min_value=5, max_value=600, step=5, key=add_est_key, label_visibility="collapsed")
            with add_cols[3]:
                st.text_input(
                    "Date",
                    key=add_date_key,
                    placeholder=selected_day.isoformat(),
                    label_visibility="collapsed",
                )
            with add_cols[4]:
                st.text_input(
                    "Start",
                    key=add_time_key,
                    placeholder="HH:MM",
                    label_visibility="collapsed",
                )
            with add_cols[5]:
                confirm_add = st.form_submit_button("Add", use_container_width=True, type="primary")

        if confirm_add:
            draft["title"] = st.session_state.get(add_title_key, "")
            draft["priority"] = st.session_state.get(add_priority_key, "Medium")
            draft["estimated"] = int(st.session_state.get(add_est_key, 30) or 30)
            draft["date"] = (st.session_state.get(add_date_key, "") or "").strip()
            draft["time"] = (st.session_state.get(add_time_key, "") or "").strip()

            if not (draft["title"] or "").strip():
                st.warning("Task title is required.")
            else:
                invalid = False
                if draft["date"]:
                    try:
                        scheduled_date = datetime.strptime(draft["date"], "%Y-%m-%d").date()
                    except ValueError:
                        st.warning("Date must be in YYYY-MM-DD format.")
                        invalid = True
                        scheduled_date = selected_day
                else:
                    scheduled_date = selected_day

                if draft["time"]:
                    try:
                        scheduled_time = datetime.strptime(draft["time"], "%H:%M").time()
                    except ValueError:
                        st.warning("Time must be in HH:MM format.")
                        invalid = True
                        scheduled_time = None
                else:
                    scheduled_time = None

                if not invalid:
                    created = repositories.save_activity(
                        {
                            "user_email": user_email,
                            "title": draft["title"],
                            "source": "manual",
                            "scheduled_date": scheduled_date,
                            "scheduled_time": scheduled_time,
                            "priority_tag": draft["priority"],
                            "estimated_minutes": draft["estimated"],
                        }
                    )
                try:
                    _sync_created_or_updated_activity_to_google(user_email, created["id"], connected, primary_calendar_id)
                except Exception as exc:
                    st.session_state["calendar.sync_status"] = "Failed"
                    st.session_state["calendar.sync_error"] = str(exc)
                    st.warning(f"Saved locally, but Google sync failed: {exc}")
                    draft["title"] = ""
                    draft["date"] = ""
                    draft["time"] = ""
                    st.session_state[reset_key] = True
                    st.session_state["calendar.force_refresh"] = True
                    st.rerun()

        with st.expander("Remembered tasks (to decide)", expanded=False):
            with st.form(key="calendar.remembered.form", clear_on_submit=False):
                rem_cols = st.columns([3.0, 1.0, 1.0, 1.0])
                with rem_cols[0]:
                    st.text_input("Remembered task", key="calendar.remembered.title", placeholder="Something to do later")
                with rem_cols[1]:
                    st.selectbox("Priority", PRIORITY_TAGS, key="calendar.remembered.priority")
                with rem_cols[2]:
                    st.number_input("Est", min_value=5, max_value=600, step=5, value=20, key="calendar.remembered.est")
                with rem_cols[3]:
                    confirm_remembered = st.form_submit_button("Add", use_container_width=True)

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
        st.markdown("</div>", unsafe_allow_html=True)

    with layout[1]:
        st.markdown("<div class='calendar-card'>", unsafe_allow_html=True)
        st.markdown("<div class='calendar-section-title'>Day Schedule</div>", unsafe_allow_html=True)
        if st_calendar:
            view_map = {"Day": "timeGridDay", "Week": "timeGridWeek", "Month": "dayGridMonth"}
            calendar_events = _build_calendar_events(range_tasks)
            calendar_options = {
                "initialView": view_map.get(view_mode, "timeGridDay"),
                "initialDate": selected_day.isoformat(),
                "editable": True,
                "selectable": True,
                "selectMirror": True,
                "nowIndicator": True,
                "allDaySlot": False,
                "slotMinTime": "00:00:00",
                "slotMaxTime": "24:00:00",
                "slotDuration": "00:30:00",
                "height": 480,
                "headerToolbar": {
                    "left": "prev,next today",
                    "center": "title",
                    "right": "",
                },
            }
            cal_state = st_calendar(
                events=calendar_events,
                options=calendar_options,
                key=f"calendar.full.{selected_day.isoformat()}",
            )

            if cal_state and cal_state.get("callback"):
                callback = cal_state.get("callback")
                payload = cal_state.get(callback)
                signature = f"{callback}:{payload}"
                last_sig = st.session_state.get("calendar.last_callback")
                if signature != last_sig:
                    st.session_state["calendar.last_callback"] = signature
                    if callback == "select" and payload:
                        start_dt = _parse_iso_datetime(payload.get("start"))
                        end_dt = _parse_iso_datetime(payload.get("end"))
                        all_day = bool(payload.get("allDay"))
                        if start_dt:
                            if all_day:
                                scheduled_date = start_dt.date()
                                scheduled_time = None
                                est_minutes = 60
                            else:
                                scheduled_date = start_dt.date()
                                scheduled_time = start_dt.strftime("%H:%M")
                                if end_dt:
                                    est_minutes = int(max((end_dt - start_dt).total_seconds() // 60, 15))
                                else:
                                    est_minutes = 30
                            created = repositories.save_activity(
                                {
                                    "user_email": user_email,
                                    "title": "New activity",
                                    "source": "manual",
                                    "scheduled_date": scheduled_date,
                                    "scheduled_time": scheduled_time,
                                    "priority_tag": "Medium",
                                    "estimated_minutes": est_minutes,
                                }
                            )
                            try:
                                _sync_created_or_updated_activity_to_google(user_email, created["id"], connected, primary_calendar_id)
                            except Exception as exc:
                                st.session_state["calendar.sync_status"] = "Failed"
                                st.session_state["calendar.sync_error"] = str(exc)
                                st.warning(f"Saved locally, but Google sync failed: {exc}")
                            st.session_state["calendar.force_refresh"] = True
                            st.rerun()
                    elif callback == "eventChange" and payload:
                        event = payload.get("event", {})
                        task_id = event.get("id")
                        if task_id:
                            start_dt = _parse_iso_datetime(event.get("start"))
                            end_dt = _parse_iso_datetime(event.get("end"))
                            all_day = bool(event.get("allDay"))
                            scheduled_date = start_dt.date() if start_dt else selected_day
                            scheduled_time = None if all_day else (start_dt.strftime("%H:%M") if start_dt else None)
                            patch = {"id": task_id, "scheduled_date": scheduled_date, "scheduled_time": scheduled_time}
                            if (not all_day) and start_dt and end_dt:
                                est_minutes = int(max((end_dt - start_dt).total_seconds() // 60, 15))
                                patch["estimated_minutes"] = est_minutes
                            repositories.save_activity(patch)
                            try:
                                _sync_created_or_updated_activity_to_google(user_email, task_id, connected, primary_calendar_id)
                            except Exception as exc:
                                st.session_state["calendar.sync_status"] = "Failed"
                                st.session_state["calendar.sync_error"] = str(exc)
                                st.warning(f"Saved locally, but Google sync failed: {exc}")
                            st.session_state["calendar.force_refresh"] = True
                            st.rerun()
        else:
            day_rows = _build_day_hour_board(day_tasks)
            grid_html = "<div class='day-grid'>" + "".join(
                [
                    f"<div class='day-row'><div class='day-hour'>{hour}</div><div class='day-slot'>{slot or ''}</div></div>"
                    for hour, slot in day_rows
                ]
                    ) + "</div>"
            st.markdown(grid_html, unsafe_allow_html=True)

            if view_mode in {"Week", "Month"}:
                with st.expander("Secondary calendar view", expanded=False):
                    if view_mode == "Week":
                        week_hour_rows = _build_week_hour_board(range_tasks, start_day)
                        st.dataframe(pd.DataFrame(week_hour_rows), use_container_width=True, hide_index=True, height=300)
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
                                            for item in day_items[:3]
                                        ]
                                    ),
                                }
                            )
                            day += timedelta(days=1)
                        st.dataframe(pd.DataFrame(month_rows), use_container_width=True, hide_index=True, height=300)
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("</div>", unsafe_allow_html=True)
    st.divider()
    st.caption(f"Range: {start_day.strftime('%d/%m/%Y')} - {end_day.strftime('%d/%m/%Y')}")
    _render_diagnostics(connected)
