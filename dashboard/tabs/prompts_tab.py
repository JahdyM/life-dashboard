from datetime import date

import streamlit as st

from dashboard.data import repositories


def _couple_key(user_email, partner_email):
    if not partner_email:
        return f"solo::{user_email}"
    ordered = sorted([user_email, partner_email])
    return f"couple::{ordered[0]}::{ordered[1]}"


def _save_prompt(card_id, user_email, day, answer_key, done_key):
    repositories.save_prompt_answer(
        card_id,
        user_email,
        day,
        st.session_state.get(answer_key, ""),
        st.session_state.get(done_key, False),
    )


def render_prompts_tab(ctx):
    user_email = ctx["current_user_email"]
    partner_email = ctx.get("partner_email")
    partner_name = ctx.get("partner_name") or "Partner"

    st.markdown("<div class='section-title'>Spouse × Partner Prompts</div>", unsafe_allow_html=True)

    day = st.date_input("Prompt date", key="prompts.date", value=date.today())
    couple_key = _couple_key(user_email, partner_email)

    add_cols = st.columns([3, 1.4, 0.8])
    with add_cols[0]:
        st.text_input("New prompt", key="prompts.new_title", placeholder="Add a prompt card")
    with add_cols[1]:
        st.text_input("Category", key="prompts.new_category", placeholder="Connection, Growth...")
    with add_cols[2]:
        if st.button("+", key="prompts.add", type="tertiary"):
            try:
                repositories.add_prompt_card(
                    couple_key,
                    st.session_state.get("prompts.new_title", ""),
                    st.session_state.get("prompts.new_category", ""),
                )
                st.session_state["prompts.new_title"] = ""
                st.session_state["prompts.new_category"] = ""
                st.rerun()
            except Exception as exc:
                st.warning(str(exc))

    cards = repositories.list_prompt_cards(couple_key)
    answers = repositories.list_prompt_answers_by_date(couple_key, day)
    answer_map = {(item["card_id"], item["user_email"]): item for item in answers}

    if not cards:
        st.caption("No prompt cards yet.")
        return

    st.caption("Each card saves independently. Partial progress is always preserved.")

    for card in cards:
        card_id = card["id"]
        title = card.get("title") or "Prompt"
        category = card.get("category") or ""

        st.markdown(f"**{title}**")
        if category:
            st.caption(category)

        my_answer = answer_map.get((card_id, user_email), {})
        partner_answer = answer_map.get((card_id, partner_email), {}) if partner_email else {}

        answer_key = f"prompts.answer.{card_id}.{day.isoformat()}"
        done_key = f"prompts.done.{card_id}.{day.isoformat()}"

        if answer_key not in st.session_state:
            st.session_state[answer_key] = my_answer.get("answer_text") or ""
        if done_key not in st.session_state:
            st.session_state[done_key] = bool(my_answer.get("is_completed", 0))

        cols = st.columns([4, 1])
        with cols[0]:
            st.text_area(
                "Your answer",
                key=answer_key,
                height=90,
                label_visibility="collapsed",
                on_change=_save_prompt,
                args=(card_id, user_email, day, answer_key, done_key),
            )
        with cols[1]:
            st.checkbox(
                "Done",
                key=done_key,
                on_change=_save_prompt,
                args=(card_id, user_email, day, answer_key, done_key),
            )

        save_cols = st.columns([1, 5])
        with save_cols[0]:
            if st.button("✕", key=f"prompts.remove.{card_id}", type="tertiary"):
                repositories.remove_prompt_card(couple_key, card_id)
                st.rerun()

        if partner_email:
            partner_text = partner_answer.get("answer_text") or ""
            partner_done = bool(partner_answer.get("is_completed", 0))
            st.caption(f"{partner_name}: {'✅' if partner_done else '⬜'} {partner_text if partner_text else 'No answer yet'}")

        st.divider()
