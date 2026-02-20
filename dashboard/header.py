from datetime import date

import streamlit as st


def render_global_header(ctx):
    shared_snapshot = ctx.get("shared_snapshot") or {}
    current_name = ctx.get("current_user_name") or "You"
    partner_name = ctx.get("partner_name") or "Partner"
    habit_labels = ctx.get("habit_labels", {})

    st.markdown(
        """
        <style>
        .sticky-header-wrap {
            position: sticky;
            top: 0.2rem;
            z-index: 999;
            padding: 0.45rem 0.6rem;
            border-radius: 12px;
            border: 1px solid var(--border);
            backdrop-filter: blur(6px);
            background: rgba(18, 14, 26, 0.65);
            margin-bottom: 0.6rem;
        }
        .streak-row {
            border: 1px solid var(--border);
            border-radius: 9px;
            padding: 0.25rem 0.45rem;
            background: rgba(22, 18, 32, 0.6);
            margin-bottom: 0.25rem;
        }
        .streak-title {
            font-weight: 600;
            font-size: 0.78rem;
            margin-bottom: 0.1rem;
            display: flex;
            align-items: center;
            gap: 0.35rem;
        }
        .streak-line {
            font-size: 0.74rem;
        }
        .streak-emoji {
            font-size: 1.2rem;
            line-height: 1;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    habits = shared_snapshot.get("habits", [])
    summary = shared_snapshot.get("summary") or "Shared streak summary unavailable yet."
    today_iso = shared_snapshot.get("today") or date.today().isoformat()

    st.markdown("<div class='sticky-header-wrap'>", unsafe_allow_html=True)
    st.markdown(f"<div class='small-label'>Shared Habits Streak • {today_iso}</div>", unsafe_allow_html=True)

    if not habits:
        st.caption("No shared streak data available yet.")
    else:
        cols = st.columns(5)
        for idx, item in enumerate(habits):
            habit_key = item.get("habit_key")
            label = habit_labels.get(habit_key, habit_key.replace("_", " ").title())
            a_days = int(item.get("user_a_days", 0) or 0)
            b_days = int(item.get("user_b_days", 0) or 0)
            with cols[idx % 5]:
                st.markdown(
                    (
                        "<div class='streak-row'>"
                        f"<div class='streak-title'><span class='streak-emoji'>🔥</span>{label}</div>"
                        f"<div class='streak-line'>{a_days} days | {current_name}</div>"
                        f"<div class='streak-line'>{b_days} days | {partner_name}</div>"
                        "</div>"
                    ),
                    unsafe_allow_html=True,
                )

    st.caption(summary)
    st.markdown("</div>", unsafe_allow_html=True)
