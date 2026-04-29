from datetime import date, timedelta

import streamlit as st

from dashboard.visualizations import mood_heatmap, build_month_tracker_grid, build_year_tracker_grid
from dashboard.data.loaders import load_data

_MOOD_INSIGHTS = {
    "Paz": "Ótimo! Um dia de paz é um presente. 🕊️",
    "Felicidade": "Que lindo! Guarda esse sentimento. 😊",
    "Ansiedade": "Respira fundo. Você está dando conta. 🌬️",
    "Medo": "É corajoso reconhecer o que sente. Você não está sozinha. 🤍",
    "Raiva": "Válido sentir. Deixa passar e cuida de si. 🌊",
    "Neutro": "Dias neutros também fazem parte. 🌫️",
}


def render_mood_tab(ctx):
    data = ctx.get("data")
    st.markdown("<div class='section-title'>Mood Board</div>", unsafe_allow_html=True)

    if data is None or getattr(data, "empty", True):
        range_start = date.today() - timedelta(days=400)
        data = load_data(range_start, date.today())

    mood_map = {}
    if data is not None and not getattr(data, "empty", True):
        mood_map = {row["date"]: row["mood_category"] for _, row in data.iterrows() if row.get("mood_category")}

    # Show today's mood insight if registered
    today_mood = mood_map.get(date.today())
    if today_mood and today_mood in _MOOD_INSIGHTS:
        st.info(_MOOD_INSIGHTS[today_mood])

    # Mood frequency summary for the last 30 days
    if mood_map:
        last_30_start = date.today() - timedelta(days=30)
        recent_moods = [m for d, m in mood_map.items() if d >= last_30_start and m]
        if recent_moods:
            from collections import Counter
            counts = Counter(recent_moods)
            most_common_mood, most_common_count = counts.most_common(1)[0]
            st.markdown(
                f"<div class='small-label' style='margin-bottom:6px;'>Nos últimos 30 dias: humor mais frequente é "
                f"<strong>{most_common_mood}</strong> ({most_common_count}x). "
                f"Total de registros: {len(recent_moods)}.</div>",
                unsafe_allow_html=True,
            )

    month_col, year_col = st.columns(2)
    with month_col:
        month_choice = st.date_input("Mês", value=date.today().replace(day=1), key="mood.board.month")
        z, hover_text, x_labels, y_labels = build_month_tracker_grid(month_choice.year, month_choice.month, mood_map)
        st.plotly_chart(
            mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Mapa de Humor Mensal"),
            use_container_width=True,
        )
    with year_col:
        years = list(range(date.today().year - 3, date.today().year + 1))
        year_choice = st.selectbox("Ano", years, index=len(years) - 1, key="mood.board.year")
        z, hover_text, x_labels, y_labels = build_year_tracker_grid(year_choice, mood_map)
        st.plotly_chart(
            mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Mapa de Humor Anual"),
            use_container_width=True,
        )
