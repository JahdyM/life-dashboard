"""Goals & Plans tab — shared goals, bucket list, weekly check-in."""
from datetime import date, timedelta

import streamlit as st

from dashboard.data import repositories

GOAL_CATEGORIES = ["💑 Casal", "✈️ Viagem", "📚 Aprendizado", "💪 Saúde", "💰 Financeiro", "🌱 Pessoal", "🔭 Sonho"]
GOAL_SIZES = ["🌱 Pequena", "🎯 Média", "🌟 Grande", "🚀 Sonho grande"]
GOAL_EMOJIS = ["🎯", "✈️", "📚", "💪", "🌍", "🏠", "🎓", "💒", "🔭", "🌊", "🎶", "🌿"]

_SIZE_ORDER = {s: i for i, s in enumerate(GOAL_SIZES)}
_SIZE_COLORS = {
    "🌱 Pequena": "#b7d1c9",
    "🎯 Média": "#8FB6D9",
    "🌟 Grande": "#c9b3e5",
    "🚀 Sonho grande": "#D9C979",
}


def _progress_pill(pct: int) -> str:
    color = "#9DCFB7" if pct == 100 else "#8e79af" if pct >= 50 else "#D9C979"
    return (
        f"<div style='background:var(--bg-panel);border-radius:999px;height:6px;overflow:hidden;margin:5px 0 2px;'>"
        f"<div style='background:{color};width:{pct}%;height:6px;border-radius:999px;'></div></div>"
        f"<div style='font-size:0.7rem;color:var(--text-soft);'>{pct}% {'✅' if pct==100 else ''}</div>"
    )


def _iso_week(d: date) -> str:
    return d.strftime("%Y-W%W")


def render_goals_tab(ctx):
    user_a = ctx["current_user_email"]
    user_b = ctx.get("partner_email", "")
    current_name = ctx.get("current_user_name", "Você")

    st.markdown("<div class='section-title'>Metas & Planos</div>", unsafe_allow_html=True)

    if repositories.api_enabled():
        st.info("Metas disponíveis no modo local.")
        return

    today = date.today()

    # --- Weekly check-in (shows on Mondays, or always visible) ---
    week_iso = _iso_week(today)
    show_checkin = today.weekday() == 0  # Monday
    with st.expander("📝 Check-in semanal" + (" ✨ Nova semana!" if show_checkin else ""), expanded=show_checkin):
        existing_checkin = repositories.get_weekly_checkin(user_a, week_iso)
        checkin_key = f"goals.checkin.{week_iso}"
        if checkin_key not in st.session_state:
            st.session_state[checkin_key] = existing_checkin
        st.markdown(
            f"<div class='small-label'>Semana de {(today - timedelta(days=today.weekday())).strftime('%d/%m')} — "
            f"Qual é sua intenção para esta semana?</div>",
            unsafe_allow_html=True,
        )
        checkin_text = st.text_area(
            "Sua intenção da semana",
            key=checkin_key,
            placeholder="Ex: Focar na dissertação, priorizar descanso, ter pelo menos uma data noite...",
            height=90,
            label_visibility="collapsed",
        )
        if st.button("Salvar check-in", key="goals.checkin.save", type="primary"):
            repositories.save_weekly_checkin(user_a, week_iso, checkin_text)
            st.success("Check-in salvo! ✨")

    st.markdown("---")

    # --- Goals ---
    st.markdown("<div class='small-label'>Metas do casal</div>", unsafe_allow_html=True)
    goals = repositories.get_goals(user_a, user_b)
    active_goals = [g for g in goals if not g.get("is_done")]
    done_goals = [g for g in goals if g.get("is_done")]

    if active_goals:
        active_sorted = sorted(active_goals, key=lambda g: _SIZE_ORDER.get(g.get("size", ""), 1), reverse=True)
        for g in active_sorted:
            size_color = _SIZE_COLORS.get(g.get("size", ""), "#8e79af")
            gc1, gc2, gc3 = st.columns([0.5, 6, 1.2])
            with gc1:
                st.markdown(f"<div style='font-size:1.5rem;padding-top:4px;'>{g.get('emoji','🎯')}</div>",
                            unsafe_allow_html=True)
            with gc2:
                deadline_str = ""
                if g.get("target_date"):
                    try:
                        td = date.fromisoformat(g["target_date"])
                        days_left = (td - today).days
                        deadline_str = f" · {'⏰ ' if days_left < 30 else ''}{td.strftime('%d/%m/%Y')} ({days_left}d)"
                    except Exception:
                        pass
                st.markdown(
                    f"<div style='margin-bottom:2px;'><span style='font-weight:600;'>{g['title']}</span>"
                    f" <span style='font-size:0.75rem;color:{size_color};'>{g.get('size','')}</span>"
                    f" <span style='font-size:0.72rem;color:var(--text-soft);'>{g.get('category','')}{deadline_str}</span></div>"
                    + _progress_pill(int(g.get("progress", 0))),
                    unsafe_allow_html=True,
                )
            with gc3:
                new_pct = st.number_input(
                    "%", min_value=0, max_value=100, step=5,
                    value=int(g.get("progress", 0)),
                    key=f"goals.pct.{g['id']}", label_visibility="collapsed",
                )
                if new_pct != g.get("progress"):
                    repositories.update_goal_progress(user_a, user_b, g["id"], new_pct)
                    st.rerun()
                if st.button("✕", key=f"goals.del.{g['id']}", type="tertiary"):
                    repositories.remove_goal(user_a, user_b, g["id"])
                    st.rerun()
    else:
        st.caption("Nenhuma meta ativa. Adicione uma!")

    if done_goals:
        with st.expander(f"✅ Metas concluídas ({len(done_goals)})"):
            for g in done_goals:
                st.markdown(f"✅ {g.get('emoji','')} **{g['title']}** — {g.get('category','')}")

    with st.expander("➕ Nova meta"):
        nc = st.columns([3, 1.5, 1.5, 1, 1.5])
        g_title = nc[0].text_input("Meta", key="goals.new.title", placeholder="ex: Visitar o Pantanal")
        g_cat = nc[1].selectbox("Categoria", GOAL_CATEGORIES, key="goals.new.cat")
        g_size = nc[2].selectbox("Tamanho", GOAL_SIZES, index=1, key="goals.new.size")
        g_emoji = nc[3].text_input("Emoji", value="🎯", key="goals.new.emoji", max_chars=4)
        g_deadline = nc[4].date_input("Prazo (opcional)", value=None, key="goals.new.deadline")
        if st.button("Criar meta", type="primary", key="goals.new.save"):
            if g_title.strip():
                repositories.add_goal(user_a, user_b, g_title, g_cat, g_size,
                                      g_emoji or "🎯", g_deadline, current_name)
                st.success("Meta criada!")
                st.rerun()
            else:
                st.warning("Digite o nome da meta.")

    st.markdown("---")

    # --- Bucket list ---
    st.markdown("<div class='small-label'>Bucket list do casal 🌍</div>", unsafe_allow_html=True)
    bucket = repositories.get_bucket_list(user_a, user_b)
    pending = [b for b in bucket if not b.get("is_done")]
    done_bucket = [b for b in bucket if b.get("is_done")]

    if pending:
        for item in pending:
            bc1, bc2 = st.columns([8, 0.8])
            with bc1:
                if st.checkbox(item["title"], key=f"bucket.check.{item['id']}",
                                value=False, label_visibility="visible"):
                    repositories.toggle_bucket_item(user_a, user_b, item["id"])
                    st.rerun()
            with bc2:
                if st.button("✕", key=f"bucket.del.{item['id']}", type="tertiary"):
                    repositories.remove_bucket_item(user_a, user_b, item["id"])
                    st.rerun()
    else:
        st.caption("Bucket list vazia — adicionem seus sonhos!")

    new_bucket = st.text_input("Adicionar ao bucket list", key="goals.bucket.new",
                                placeholder="ex: Ver aurora boreal juntos")
    if st.button("Adicionar", key="goals.bucket.add"):
        if new_bucket.strip():
            repositories.add_bucket_item(user_a, user_b, new_bucket)
            st.session_state["goals.bucket.new"] = ""
            st.rerun()

    if done_bucket:
        with st.expander(f"✅ Já vivemos isso! ({len(done_bucket)})"):
            for item in done_bucket:
                done_str = f" — {item['done_date']}" if item.get("done_date") else ""
                st.markdown(f"✅ {item['title']}{done_str}")
