from datetime import date

import streamlit as st


def _habit_indicator(expected: bool, done: bool) -> str:
    if not expected:
        return "⬜"
    return "✅" if done else "⭕"


@st.fragment
def render_global_header(ctx):
    shared_snapshot = ctx.get("shared_snapshot") or {}
    current_name = ctx.get("current_user_name") or "You"
    partner_name = ctx.get("partner_name") or "Partner"
    habit_labels = ctx.get("habit_labels", {})
    shared_habit_keys = ctx.get("shared_habit_keys", [])
    backend_ok = ctx.get("backend_ok", True)

    habits = shared_snapshot.get("habits", [])
    summary = shared_snapshot.get("summary") or "Shared streak summary unavailable yet."
    today_iso = shared_snapshot.get("today") or date.today().isoformat()

    if not habits and shared_habit_keys:
        habits = [{"habit_key": key, "user_a_days": 0, "user_b_days": 0} for key in shared_habit_keys]
        if "unavailable" in summary.lower():
            total = len(shared_habit_keys)
            summary = f"Today both completed 0/{total} shared habits. At least one of you completed 0/{total}."

    # Compute today's completion counts and sync score
    a_done_today = sum(
        1 for h in habits
        if int(h.get("user_a_today_expected", 0)) == 1 and int(h.get("user_a_today_done", 0)) == 1
    )
    b_done_today = sum(
        1 for h in habits
        if int(h.get("user_b_today_expected", 0)) == 1 and int(h.get("user_b_today_done", 0)) == 1
    )
    a_expected_today = sum(1 for h in habits if int(h.get("user_a_today_expected", 0)) == 1)
    b_expected_today = sum(1 for h in habits if int(h.get("user_b_today_expected", 0)) == 1)
    sync_count = sum(
        1 for h in habits
        if int(h.get("user_a_today_expected", 0)) == 1
        and int(h.get("user_b_today_expected", 0)) == 1
        and int(h.get("user_a_today_done", 0)) == 1
        and int(h.get("user_b_today_done", 0)) == 1
    )
    sync_total = sum(
        1 for h in habits
        if int(h.get("user_a_today_expected", 0)) == 1 and int(h.get("user_b_today_expected", 0)) == 1
    )
    sync_pct = round((sync_count / sync_total) * 100) if sync_total > 0 else 0
    sync_emoji = "💞" if sync_pct >= 80 else "💫" if sync_pct >= 50 else "🌱"

    st.markdown("<div class='sticky-header-wrap'>", unsafe_allow_html=True)

    # Top row: date + sync badge
    top_cols = st.columns([6, 2, 2, 2])
    top_cols[0].markdown(
        f"<div class='small-label'>Hábitos compartilhados • {today_iso}</div>",
        unsafe_allow_html=True,
    )
    top_cols[1].markdown(
        f"<div class='small-label' style='text-align:center;'>"
        f"<span title='Hábitos completos hoje'>{current_name}: {a_done_today}/{a_expected_today}</span></div>",
        unsafe_allow_html=True,
    )
    top_cols[2].markdown(
        f"<div class='small-label' style='text-align:center;'>"
        f"<span title='Hábitos completos hoje'>{partner_name}: {b_done_today}/{b_expected_today}</span></div>",
        unsafe_allow_html=True,
    )
    top_cols[3].markdown(
        f"<div class='small-label' style='text-align:center;'>"
        f"{sync_emoji} Sync: {sync_count}/{sync_total}</div>",
        unsafe_allow_html=True,
    )

    # Habit streak cards
    cols = st.columns(len(habits) if habits else 5)
    for idx, item in enumerate(habits):
        habit_key = item.get("habit_key")
        label = habit_labels.get(habit_key, habit_key.replace("_", " ").title())
        a_days = int(item.get("user_a_days", 0) or 0)
        b_days = int(item.get("user_b_days", 0) or 0)
        a_expected = int(item.get("user_a_today_expected", 0) or 0) == 1
        b_expected = int(item.get("user_b_today_expected", 0) or 0) == 1
        a_done = int(item.get("user_a_today_done", 0) or 0) == 1
        b_done = int(item.get("user_b_today_done", 0) or 0) == 1

        a_indicator = _habit_indicator(a_expected, a_done)
        b_indicator = _habit_indicator(b_expected, b_done)

        # 🔥 only if has streak; otherwise use 📌
        streak_icon = "🔥" if (a_days > 0 or b_days > 0) else "📌"

        with cols[idx % len(cols)]:
            st.markdown(
                (
                    "<div class='streak-row'>"
                    f"<div class='streak-title'><span class='streak-emoji'>{streak_icon}</span>{label}</div>"
                    f"<div class='streak-line'>{a_indicator} {a_days}d | {current_name}</div>"
                    f"<div class='streak-line'>{b_indicator} {b_days}d | {partner_name}</div>"
                    "</div>"
                ),
                unsafe_allow_html=True,
            )

    # Partner habit nudge: habits partner did that I haven't yet
    nudges = [
        habit_labels.get(h.get("habit_key"), h.get("habit_key", "").replace("_", " ").title())
        for h in habits
        if int(h.get("user_b_today_expected", 0)) == 1
        and int(h.get("user_b_today_done", 0)) == 1
        and int(h.get("user_a_today_expected", 0)) == 1
        and int(h.get("user_a_today_done", 0)) == 0
    ]
    if nudges:
        nudge_list = ", ".join(nudges)
        st.info(
            f"💌 {partner_name} já completou: **{nudge_list}** — sua vez!",
            icon=None,
        )

    if not backend_ok:
        st.warning("Backend inicializando… dados podem demorar um momento.")
    st.caption(summary)
    st.markdown("</div>", unsafe_allow_html=True)
