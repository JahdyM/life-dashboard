import calendar
from datetime import date, timedelta

import streamlit as st

from dashboard.data import repositories, api_client
from dashboard.constants import JAHDY_EMAIL, GUILHERME_EMAIL, MOOD_TO_INT, DEFAULT_HABIT_LABELS, MOOD_COLORS
from dashboard.visualizations import mood_heatmap


SHARED_HABITS = [
    "bible_reading",
    "meeting_attended",
    "prepare_meeting",
    "workout",
    "shower",
    "daily_text",
    "family_worship",
]

_SYNC_MESSAGES = {
    100: ("💞", "Perfeitos hoje! Vocês completaram todos os hábitos juntos."),
    80:  ("✨", "Quase lá! Dia muito sincronizado."),
    50:  ("🌿", "Bom progresso juntos hoje."),
    0:   ("🌱", "Cada passo conta. Amanhã tem mais!"),
}


def _sync_message(pct: int) -> tuple[str, str]:
    for threshold in sorted(_SYNC_MESSAGES, reverse=True):
        if pct >= threshold:
            return _SYNC_MESSAGES[threshold]
    return _SYNC_MESSAGES[0]


def _render_sync_score(streak_snapshot: dict, user_a_name: str, user_b_name: str):
    habits = streak_snapshot.get("habits", [])
    if not habits:
        return

    a_done = sum(
        1 for h in habits
        if int(h.get("user_a_today_expected", 0)) == 1 and int(h.get("user_a_today_done", 0)) == 1
    )
    b_done = sum(
        1 for h in habits
        if int(h.get("user_b_today_expected", 0)) == 1 and int(h.get("user_b_today_done", 0)) == 1
    )
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
    pct = round((sync_count / sync_total) * 100) if sync_total > 0 else 0
    icon, msg = _sync_message(pct)

    a_total_expected = sum(1 for h in habits if int(h.get("user_a_today_expected", 0)) == 1)
    b_total_expected = sum(1 for h in habits if int(h.get("user_b_today_expected", 0)) == 1)

    st.markdown(
        f"""
<div class="card" style="text-align:center; padding: 20px 24px;">
  <div style="font-size:2.2rem; margin-bottom:4px;">{icon}</div>
  <div style="font-size:1.05rem; font-weight:600; margin-bottom:6px;">Sync Score de hoje: {pct}%</div>
  <div style="font-size:0.85rem; color:var(--text-soft); margin-bottom:12px;">{msg}</div>
  <div style="display:flex; justify-content:center; gap:32px; font-size:0.82rem;">
    <div><strong>{a_done}/{a_total_expected}</strong><br/><span style="color:var(--text-soft);">{user_a_name}</span></div>
    <div style="font-size:1.4rem;">❤️</div>
    <div><strong>{b_done}/{b_total_expected}</strong><br/><span style="color:var(--text-soft);">{user_b_name}</span></div>
  </div>
</div>
""",
        unsafe_allow_html=True,
    )


def render_couple_tab(ctx):
    user_a = JAHDY_EMAIL
    user_b = GUILHERME_EMAIL
    user_a_name = ctx.get("current_user_name", "Jahdy") if ctx.get("current_user_email") == user_a else "Jahdy"
    user_b_name = ctx.get("partner_name", "Guilherme")
    mood_to_int = MOOD_TO_INT

    st.markdown("<div class='section-title'>Couple</div>", unsafe_allow_html=True)

    today = date.today()
    row_meta = [(0, user_a, user_a_name), (1, user_b, user_b_name)]

    if repositories.api_enabled():
        try:
            streak_snapshot = api_client.request("GET", "/v1/couple/streaks")
        except Exception:
            streak_snapshot = {"habits": [], "summary": ""}
    else:
        streak_snapshot = repositories.get_shared_habit_comparison(today, user_a, user_b, SHARED_HABITS)

    # Partner mood note (today)
    if not repositories.api_enabled():
        partner_mood_today = repositories.get_partner_mood_today(user_b)
        if partner_mood_today.get("mood_note"):
            mood_color = MOOD_COLORS.get(partner_mood_today.get("mood_category", ""), "#8e79af")
            st.markdown(
                f"""<div class="card" style="border-left:3px solid {mood_color};padding:10px 16px;">
<div style="font-size:0.78rem;color:var(--text-soft);margin-bottom:2px;">
  💌 {partner_name} hoje ({partner_mood_today.get('mood_category','')})
</div>
<div style="font-size:0.93rem;">{partner_mood_today['mood_note']}</div>
</div>""",
                unsafe_allow_html=True,
            )

    # Sync Score card
    _render_sync_score(streak_snapshot, user_a_name, user_b_name)

    # Streak table
    st.markdown("<div class='small-label' style='margin-top:4px;'>Sequência de hábitos compartilhados</div>", unsafe_allow_html=True)
    habits_list = streak_snapshot.get("habits", [])
    if habits_list:
        header_cols = st.columns([3, 2, 2])
        header_cols[0].caption("Hábito")
        header_cols[1].caption(user_a_name)
        header_cols[2].caption(user_b_name)
        st.divider()
        for item in habits_list:
            key = item.get("habit_key")
            label = DEFAULT_HABIT_LABELS.get(key, key)
            a_days = int(item.get("user_a_days", 0) or 0)
            b_days = int(item.get("user_b_days", 0) or 0)
            a_done = int(item.get("user_a_today_done", 0) or 0) == 1
            b_done = int(item.get("user_b_today_done", 0) or 0) == 1
            a_icon = "✅" if a_done else "⭕"
            b_icon = "✅" if b_done else "⭕"
            row_cols = st.columns([3, 2, 2])
            row_cols[0].markdown(f"🔥 **{label}**")
            row_cols[1].caption(f"{a_icon} {a_days} dias")
            row_cols[2].caption(f"{b_icon} {b_days} dias")

    st.caption(streak_snapshot.get("summary") or "")

    # --- Special dates ---
    st.markdown("<div class='small-label' style='margin-top:14px;'>Datas especiais</div>", unsafe_allow_html=True)
    if not repositories.api_enabled():
        upcoming = repositories.upcoming_special_dates(user_a, user_b, window_days=90)
        if upcoming:
            for item in upcoming:
                days_away = item["days_away"]
                badge = "🎉 Hoje!" if days_away == 0 else f"em {days_away}d"
                st.markdown(
                    f"""<div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid var(--divider);">
<span style="font-size:1.2rem;">{item.get('emoji','❤️')}</span>
<span style="flex:1;font-size:0.9rem;">{item['title']} <span style="color:var(--text-soft);font-size:0.78rem;">({item['next_date']})</span></span>
<span style="font-size:0.75rem;color:var(--accent-purple);">{badge}</span>
<span></span></div>""",
                    unsafe_allow_html=True,
                )
        else:
            st.caption("Nenhuma data especial nos próximos 90 dias.")

        with st.expander("➕ Adicionar data especial"):
            cols_form = st.columns([3, 1, 1, 1])
            new_title = cols_form[0].text_input("Nome da data", key="couple.sd.title", placeholder="ex: Aniversário de namoro")
            new_month = cols_form[1].number_input("Mês", min_value=1, max_value=12, step=1, key="couple.sd.month")
            new_day = cols_form[2].number_input("Dia", min_value=1, max_value=31, step=1, key="couple.sd.day")
            new_emoji = cols_form[3].text_input("Emoji", value="❤️", key="couple.sd.emoji", max_chars=4)
            if st.button("Salvar data", key="couple.sd.save", type="primary"):
                if new_title.strip():
                    repositories.add_special_date(user_a, user_b, new_title, int(new_month), int(new_day), emoji=new_emoji or "❤️")
                    st.success("Data salva!")
                    st.rerun()
                else:
                    st.warning("Digite um nome para a data.")

        all_dates = repositories.get_special_dates(user_a, user_b)
        if all_dates:
            with st.expander("🗑 Remover data"):
                for item in all_dates:
                    col_a, col_b = st.columns([5, 1])
                    col_a.caption(f"{item.get('emoji','')} {item['title']} — {item['month']:02d}/{item['day']:02d}")
                    if col_b.button("✕", key=f"couple.sd.del.{item['id']}", type="tertiary"):
                        repositories.remove_special_date(user_a, user_b, item["id"])
                        st.rerun()
    else:
        st.caption("Datas especiais disponíveis no modo local (sem backend).")

    st.markdown("<div class='small-label' style='margin-top:12px;'>Mapa de humor mensal (comparativo)</div>", unsafe_allow_html=True)
    month_choice = st.date_input("Mês", value=today.replace(day=1), key="couple.mood.month")
    month_start = month_choice.replace(day=1)
    month_last = calendar.monthrange(month_start.year, month_start.month)[1]
    month_end = month_start.replace(day=month_last)

    def _empty_grid():
        z_empty = [[float("nan") for _ in range(month_last)] for _ in range(2)]
        hover_empty = [["" for _ in range(month_last)] for _ in range(2)]
        x_empty = [str(day) for day in range(1, month_last + 1)]
        y_empty = [user_a_name, user_b_name]
        return z_empty, hover_empty, x_empty, y_empty

    if repositories.api_enabled():
        month_key = month_choice.strftime("%Y-%m")
        try:
            payload = api_client.request("GET", "/v1/couple/moodboard", params={"range": "month", "month": month_key})
            if payload.get("warning"):
                st.warning(payload.get("warning"))
            z = payload.get("z", [])
            hover_text = payload.get("hover_text", [])
            x_labels = payload.get("x_labels", [])
            y_labels = payload.get("y_labels", [])
            if not x_labels:
                z, hover_text, x_labels, y_labels = _empty_grid()
        except Exception:
            st.warning("Não foi possível carregar o moodboard.")
            z, hover_text, x_labels, y_labels = _empty_grid()
    else:
        feed = repositories.get_couple_mood_feed(user_a, user_b, month_start, month_end)
        by_key = {}
        for row in feed:
            row_email = row.get("user_email")
            row_date = row.get("date")
            mood = row.get("mood_category")
            if not row_email or not row_date or not mood:
                continue
            by_key[(str(row_email), str(row_date))] = mood

        z = [[float("nan") for _ in range(month_last)] for _ in range(2)]
        hover_text = [["" for _ in range(month_last)] for _ in range(2)]
        for row_idx, email, label in row_meta:
            for day in range(1, month_last + 1):
                current = month_start.replace(day=day)
                k = (email, current.isoformat())
                mood = by_key.get(k)
                if mood and mood in mood_to_int:
                    z[row_idx][day - 1] = mood_to_int[mood]
                    hover_text[row_idx][day - 1] = f"{current.isoformat()} • {label}: {mood}"
                else:
                    hover_text[row_idx][day - 1] = f"{current.isoformat()} • {label}: sem registro"

        x_labels = [str(day) for day in range(1, month_last + 1)]
        y_labels = [user_a_name, user_b_name]

    st.plotly_chart(
        mood_heatmap(z, hover_text, x_labels=x_labels, y_labels=y_labels, title="Mapa de Humor do Casal"),
        use_container_width=True,
    )

    st.markdown("<div class='small-label' style='margin-top:8px;'>Mapa de humor anual</div>", unsafe_allow_html=True)
    years = list(range(today.year - 3, today.year + 1))
    year_choice = st.selectbox("Ano", years, index=len(years) - 1, key="couple.mood.year")
    year_start = date(year_choice, 1, 1)
    year_end = date(year_choice, 12, 31)

    if repositories.api_enabled():
        payload_year = api_client.request("GET", "/v1/couple/moodboard", params={"range": "year", "year": year_choice})
        if payload_year.get("warning"):
            st.warning(payload_year.get("warning"))
        z_year = payload_year.get("z", [])
        hover_year = payload_year.get("hover_text", [])
        x_year = payload_year.get("x_labels", [])
    else:
        feed_year = repositories.get_couple_mood_feed(user_a, user_b, year_start, year_end)
        by_key_year = {}
        for row in feed_year:
            row_email = row.get("user_email")
            row_date = row.get("date")
            mood = row.get("mood_category")
            if not row_email or not row_date or not mood:
                continue
            by_key_year[(str(row_email), str(row_date))] = mood

        total_days = (year_end - year_start).days + 1
        z_year = [[float("nan") for _ in range(total_days)] for _ in range(2)]
        hover_year = [["" for _ in range(total_days)] for _ in range(2)]
        x_year = []

        for day_offset in range(total_days):
            current = year_start + timedelta(days=day_offset)
            x_year.append(current.strftime("%b") if current.day == 1 else "")
            for row_idx, email, label in row_meta:
                mood = by_key_year.get((email, current.isoformat()))
                if mood and mood in mood_to_int:
                    z_year[row_idx][day_offset] = mood_to_int[mood]
                    hover_year[row_idx][day_offset] = f"{current.isoformat()} • {label}: {mood}"
                else:
                    hover_year[row_idx][day_offset] = f"{current.isoformat()} • {label}: sem registro"

    st.plotly_chart(
        mood_heatmap(
            z_year,
            hover_year,
            x_labels=x_year,
            y_labels=[user_a_name, user_b_name],
            title="Mapa de Humor do Casal (Ano)",
        ),
        use_container_width=True,
    )
