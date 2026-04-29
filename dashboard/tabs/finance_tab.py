"""Finance tab — shared couple expenses and savings goals."""
from datetime import date

import streamlit as st

from dashboard.data import repositories

CATEGORIES = ["🍽 Alimentação", "🏠 Moradia", "🚗 Transporte", "🎉 Lazer",
              "💊 Saúde", "📚 Educação", "🛍 Compras", "✈️ Viagem", "💡 Outros"]

_CAT_COLORS = {
    "🍽 Alimentação": "#a9c0e8", "🏠 Moradia": "#c9b3e5", "🚗 Transporte": "#f2d4a2",
    "🎉 Lazer": "#D9C979", "💊 Saúde": "#8FB6D9", "📚 Educação": "#b7d1c9",
    "🛍 Compras": "#D6A0A0", "✈️ Viagem": "#9DCFB7", "💡 Outros": "#B8B8B8",
}


def _progress_bar_html(current: float, target: float, color: str = "#8e79af") -> str:
    pct = min(100.0, round((current / target) * 100, 1)) if target > 0 else 0
    return (
        f"<div style='background:var(--bg-panel);border-radius:999px;height:7px;overflow:hidden;margin:4px 0 2px;'>"
        f"<div style='background:{color};width:{pct}%;height:7px;border-radius:999px;transition:width .4s;'></div></div>"
        f"<div style='font-size:0.72rem;color:var(--text-soft);'>{pct}% — R$ {current:,.2f} / R$ {target:,.2f}</div>"
    )


def render_finance_tab(ctx):
    user_a = ctx["current_user_email"]
    user_b = ctx.get("partner_email", "")
    current_name = ctx.get("current_user_name", "Você")
    partner_name = ctx.get("partner_name", "Parceiro")

    st.markdown("<div class='section-title'>Finanças do Casal</div>", unsafe_allow_html=True)

    if repositories.api_enabled():
        st.info("Finanças disponíveis no modo local. Configure um banco PostgreSQL + API para produção.")
        return

    today = date.today()

    # Month picker
    month_ref = st.date_input("Mês de referência", value=today.replace(day=1),
                               key="finance.month_ref")
    year, month = month_ref.year, month_ref.month

    expenses = repositories.get_expenses(user_a, user_b, year, month)
    total = sum(e.get("amount", 0) for e in expenses)

    # Summary metrics
    m_cols = st.columns(4)
    m_cols[0].metric("Total do mês", f"R$ {total:,.2f}")
    m_cols[1].metric("Registros", len(expenses))
    a_total = sum(e.get("amount", 0) for e in expenses if e.get("paid_by") == user_a)
    b_total = sum(e.get("amount", 0) for e in expenses if e.get("paid_by") == user_b)
    m_cols[2].metric(f"{current_name} pagou", f"R$ {a_total:,.2f}")
    m_cols[3].metric(f"{partner_name} pagou", f"R$ {b_total:,.2f}")

    # Category breakdown
    if expenses:
        from collections import defaultdict
        cat_totals: dict[str, float] = defaultdict(float)
        for e in expenses:
            cat_totals[e.get("category", "💡 Outros")] += e.get("amount", 0)
        st.markdown("<div class='small-label' style='margin:10px 0 4px;'>Por categoria</div>", unsafe_allow_html=True)
        cat_cols = st.columns(min(4, len(cat_totals)))
        for idx, (cat, amt) in enumerate(sorted(cat_totals.items(), key=lambda x: -x[1])):
            color = _CAT_COLORS.get(cat, "#888")
            with cat_cols[idx % len(cat_cols)]:
                st.markdown(
                    f"<div class='streak-row'><div class='streak-title'>{cat}</div>"
                    f"<div class='streak-line' style='color:{color};font-weight:600;'>R$ {amt:,.2f}</div></div>",
                    unsafe_allow_html=True,
                )

    # Expense list
    if expenses:
        st.markdown("<div class='small-label' style='margin:10px 0 4px;'>Lançamentos</div>", unsafe_allow_html=True)
        sorted_exp = sorted(expenses, key=lambda e: e.get("date", ""), reverse=True)
        for e in sorted_exp:
            paid_label = current_name if e.get("paid_by") == user_a else partner_name
            c1, c2, c3, c4, c5 = st.columns([1.2, 2, 2.5, 1.5, 0.6])
            c1.caption(e.get("date", "")[-5:])
            c2.caption(e.get("category", ""))
            c3.caption(e.get("description") or "–")
            c4.caption(f"R$ {e.get('amount', 0):,.2f} | {paid_label}")
            if c5.button("✕", key=f"fin.del.{e['id']}", type="tertiary"):
                repositories.remove_expense(user_a, user_b, e["id"], year, month)
                st.rerun()
    else:
        st.caption("Nenhum gasto registrado neste mês.")

    # Add expense form
    with st.expander("➕ Adicionar gasto"):
        fc = st.columns([1.5, 1.5, 2.5, 1.5, 1.5])
        new_amount = fc[0].number_input("Valor (R$)", min_value=0.01, step=0.5, key="fin.new.amount")
        new_cat = fc[1].selectbox("Categoria", CATEGORIES, key="fin.new.cat")
        new_desc = fc[2].text_input("Descrição", key="fin.new.desc")
        new_date = fc[3].date_input("Data", value=today, key="fin.new.date")
        new_paid = fc[4].selectbox("Quem pagou", [current_name, partner_name], key="fin.new.paid")
        paid_email = user_a if new_paid == current_name else user_b
        if st.button("Salvar gasto", type="primary", key="fin.save"):
            if new_amount and new_amount > 0:
                repositories.add_expense(user_a, user_b, new_amount, new_cat, new_desc, new_date, paid_email)
                st.success("Gasto registrado!")
                st.rerun()
            else:
                st.warning("Digite um valor válido.")

    st.markdown("---")

    # Savings goals
    st.markdown("<div class='small-label'>Metas de economia</div>", unsafe_allow_html=True)
    goals = repositories.get_savings_goals(user_a, user_b)
    if goals:
        for g in goals:
            current = float(g.get("current", 0))
            target = float(g.get("target", 1))
            pct = min(100, round((current / target) * 100)) if target > 0 else 0
            color = "#8e79af" if pct < 80 else "#9DCFB7"
            gc1, gc2 = st.columns([5, 1])
            with gc1:
                st.markdown(
                    f"<div class='streak-row'>"
                    f"<div class='streak-title'>{g.get('emoji','💰')} {g['title']}</div>"
                    + _progress_bar_html(current, target, color) +
                    "</div>",
                    unsafe_allow_html=True,
                )
            with gc2:
                new_val = st.number_input("", value=current, step=50.0, min_value=0.0,
                                          key=f"fin.goal.val.{g['id']}", label_visibility="collapsed")
                if new_val != current:
                    repositories.update_savings_goal_amount(user_a, user_b, g["id"], new_val)
                    st.rerun()
                if st.button("✕", key=f"fin.goal.del.{g['id']}", type="tertiary"):
                    repositories.remove_savings_goal(user_a, user_b, g["id"])
                    st.rerun()
    else:
        st.caption("Nenhuma meta de economia cadastrada.")

    with st.expander("➕ Nova meta de economia"):
        gfc = st.columns([3, 2, 1])
        g_title = gfc[0].text_input("Nome da meta", key="fin.goal.title", placeholder="ex: Viagem para Portugal")
        g_target = gfc[1].number_input("Valor alvo (R$)", min_value=1.0, step=100.0, key="fin.goal.target")
        g_emoji = gfc[2].text_input("Emoji", value="💰", key="fin.goal.emoji", max_chars=4)
        if st.button("Criar meta", type="primary", key="fin.goal.save"):
            if g_title.strip() and g_target > 0:
                repositories.add_savings_goal(user_a, user_b, g_title, g_target, g_emoji or "💰")
                st.success("Meta criada!")
                st.rerun()
            else:
                st.warning("Preencha nome e valor alvo.")
