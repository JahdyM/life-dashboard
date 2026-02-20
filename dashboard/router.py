import streamlit as st

from dashboard.tabs.calendar_tab import render_calendar_tab
from dashboard.tabs.couple_tab import render_couple_tab
from dashboard.tabs.habits_tab import render_habits_tab
from dashboard.tabs.mood_tab import render_mood_tab
from dashboard.tabs.stats_tab import render_stats_tab


TAB_OPTIONS = [
    "Daily Habits",
    "Calendar & Activities",
    "Statistics & Charts",
    "Mood Board",
    "Couple",
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
        return _render_habits(ctx)

    if active == "Calendar & Activities":
        return _render_calendar(ctx)

    if active == "Statistics & Charts":
        return _render_stats(ctx)

    if active == "Mood Board":
        return _render_mood(ctx)

    return _render_couple(ctx)


@st.fragment
def _render_habits(ctx):
    render_habits_tab(ctx)


@st.fragment
def _render_calendar(ctx):
    render_calendar_tab(ctx)


@st.fragment
def _render_stats(ctx):
    render_stats_tab(ctx)


@st.fragment
def _render_mood(ctx):
    render_mood_tab(ctx)


@st.fragment
def _render_couple(ctx):
    render_couple_tab(ctx)
