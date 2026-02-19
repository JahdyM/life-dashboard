import streamlit as st

from dashboard.tabs.calendar_tab import render_calendar_tab
from dashboard.tabs.habits_tab import render_habits_tab
from dashboard.tabs.mood_tab import render_mood_tab
from dashboard.tabs.prompts_tab import render_prompts_tab
from dashboard.tabs.stats_tab import render_stats_tab


TAB_OPTIONS = [
    "Daily Habits",
    "Calendar & Activities",
    "Statistics & Charts",
    "Mood Board",
    "Spouse × Partner Prompts",
]


def render_router(ctx):
    active = st.session_state.get("ui.active_tab", TAB_OPTIONS[0])
    active = st.segmented_control(
        "Workspace",
        TAB_OPTIONS,
        key="ui.active_tab",
        default=active,
    )

    if active == "Daily Habits":
        render_habits_tab(ctx)
        return

    if active == "Calendar & Activities":
        render_calendar_tab(ctx)
        return

    if active == "Statistics & Charts":
        render_stats_tab(ctx)
        return

    if active == "Mood Board":
        render_mood_tab(ctx)
        return

    render_prompts_tab(ctx)
