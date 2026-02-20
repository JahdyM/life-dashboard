from datetime import date

import streamlit as st

from dashboard.visualizations import mood_heatmap, build_month_tracker_grid, build_year_tracker_grid

def render_mood_tab(ctx):
    data = ctx["data"]
    st.markdown("<div class='section-title'>Mood Board</div>", unsafe_allow_html=True)

    mood_map = {row["date"]: row["mood_category"] for _, row in data.iterrows() if row.get("mood_category")}

    month_col, year_col = st.columns(2)
    with month_col:
        month_choice = st.date_input("Month", value=date.today().replace(day=1), key="mood.board.month")
        z, hover_text, x_labels, y_labels = build_month_tracker_grid(month_choice.year, month_choice.month, mood_map)
        st.plotly_chart(
            mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Monthly Mood Grid"),
            use_container_width=True,
        )
    with year_col:
        years = list(range(date.today().year - 3, date.today().year + 1))
        year_choice = st.selectbox("Year", years, index=len(years) - 1, key="mood.board.year")
        z, hover_text, x_labels, y_labels = build_year_tracker_grid(year_choice, mood_map)
        st.plotly_chart(
            mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Yearly Mood Grid"),
            use_container_width=True,
        )

    # Timeline removed per UX request (keep mood grids only).
