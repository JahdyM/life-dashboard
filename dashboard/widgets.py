"""Sidebar widgets: NASA APOD, daily quote, astronomical events."""
from datetime import date, datetime
import streamlit as st


# ---------------------------------------------------------------------------
# Daily quotes — rotating by day-of-year
# ---------------------------------------------------------------------------

_QUOTES = [
    ("\"Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.\"", "João 3:16"),
    ("\"O Senhor é o meu pastor e nada me faltará.\"", "Salmo 23:1"),
    ("\"Tudo posso naquele que me fortalece.\"", "Filipenses 4:13"),
    ("\"Confia no Senhor de todo o teu coração.\"", "Provérbios 3:5"),
    ("\"Buscai primeiro o reino de Deus e a sua justiça.\"", "Mateus 6:33"),
    ("\"O amor é paciente, o amor é bondoso.\"", "1 Coríntios 13:4"),
    ("\"Sede fortes e corajosos. Não temais.\"", "Josué 1:9"),
    ("\"The cosmos is within us. We are made of star-stuff.\"", "Carl Sagan"),
    ("\"Look again at that dot. That's here. That's home. That's us.\"", "Carl Sagan"),
    ("\"Somewhere, something incredible is waiting to be known.\"", "Carl Sagan"),
    ("\"The universe is under no obligation to make sense to you.\"", "Neil deGrasse Tyson"),
    ("\"We are all connected; To each other, biologically; To the Earth, chemically; To the rest of the universe, atomically.\"", "Neil deGrasse Tyson"),
    ("\"Space is big. Really big. You just won't believe how vastly hugely mind-bogglingly big it is.\"", "Douglas Adams"),
    ("\"The Earth is the cradle of humanity, but mankind cannot stay in the cradle forever.\"", "Tsiolkovsky"),
    ("\"Exploration is not a choice, really; it's an imperative.\"", "Michael Collins"),
    ("\"In seed time learn, in harvest teach, in winter enjoy.\"", "William Blake"),
    ("\"To plant a garden is to believe in tomorrow.\"", "Audrey Hepburn"),
    ("\"The clearest way into the Universe is through a forest wilderness.\"", "John Muir"),
    ("\"Look deep into nature, and then you will understand everything better.\"", "Albert Einstein"),
    ("\"We do not inherit the Earth from our ancestors; we borrow it from our children.\"", "Antoine de Saint-Exupéry"),
    ("\"A terra é nossa casa comum e cuidar dela é nossa vocação.\"", "Papa Francisco"),
    ("\"Science is not only compatible with spirituality; it is a profound source of spirituality.\"", "Carl Sagan"),
    ("\"In the beginning God created the heavens and the earth.\"", "Gênesis 1:1"),
    ("\"The heavens declare the glory of God.\"", "Salmo 19:1"),
    ("\"He counts the stars and calls them all by name.\"", "Salmo 147:4"),
    ("\"Two are better than one, because they have a good return for their labor.\"", "Eclesiastes 4:9"),
    ("\"Love bears all things, believes all things, hopes all things, endures all things.\"", "1 Coríntios 13:7"),
    ("\"Remote sensing lets us see the Earth as the living system it is.\"", "Compton Tucker"),
    ("\"Data is the new soil.\"", "David McCandless"),
    ("\"Every satellite image is a snapshot of our planet's ongoing story.\"", "Anônimo"),
]


def get_daily_quote() -> tuple[str, str]:
    idx = datetime.now().timetuple().tm_yday % len(_QUOTES)
    return _QUOTES[idx]


# ---------------------------------------------------------------------------
# Astronomical events 2025-2026 (Southern Hemisphere friendly)
# ---------------------------------------------------------------------------

_ASTRO_EVENTS = [
    ("2025-03-29", "🌑", "Eclipse solar total — Europa/África"),
    ("2025-04-12", "🌕", "Eclipse lunar penumbral"),
    ("2025-05-06", "🌠", "Chuva de meteoros Eta Aquáridas — pico"),
    ("2025-07-04", "🌍", "Terra no afélio (mais distante do Sol)"),
    ("2025-07-28", "🌠", "Chuva de meteoros Delta Aquáridas — pico"),
    ("2025-08-12", "🌠", "Perseídas — pico"),
    ("2025-08-28", "🪐", "Saturno em oposição — maior e mais brilhante"),
    ("2025-09-07", "🌕", "Eclipse lunar total visível no Brasil"),
    ("2025-10-07", "🌠", "Draconídas — pico"),
    ("2025-11-17", "🌠", "Leônidas — pico"),
    ("2025-12-13", "🌠", "Gemínidas — pico (a melhor chuva do ano!)"),
    ("2025-12-22", "❄️", "Solstício de verão (Hemisfério Sul)"),
    ("2026-01-03", "🌍", "Terra no periélio (mais próxima do Sol)"),
    ("2026-02-17", "🌑", "Eclipse solar anular"),
    ("2026-03-20", "🌸", "Equinócio de outono (Hemisfério Sul)"),
    ("2026-04-11", "🌠", "Virgínidas — pico"),
    ("2026-06-21", "☀️", "Solstício de inverno (Hemisfério Sul)"),
    ("2026-08-12", "🌠", "Perseídas 2026 — pico"),
    ("2026-08-13", "🌑", "Eclipse solar total — caminho pelo Atlântico"),
    ("2026-12-13", "🌠", "Gemínidas 2026 — pico"),
]


def get_upcoming_astro_events(window_days: int = 90) -> list[dict]:
    today = date.today()
    result = []
    for iso_date, icon, name in _ASTRO_EVENTS:
        try:
            event_date = date.fromisoformat(iso_date)
        except ValueError:
            continue
        days_away = (event_date - today).days
        if 0 <= days_away <= window_days:
            result.append({"date": iso_date, "icon": icon, "name": name, "days_away": days_away})
    return sorted(result, key=lambda e: e["days_away"])


# ---------------------------------------------------------------------------
# NASA APOD
# ---------------------------------------------------------------------------

@st.cache_data(ttl=3600 * 12, show_spinner=False)
def _fetch_apod(api_key: str) -> dict:
    import requests
    try:
        resp = requests.get(
            "https://api.nasa.gov/planetary/apod",
            params={"api_key": api_key, "thumbs": True},
            timeout=8,
        )
        if resp.ok:
            return resp.json()
    except Exception:
        pass
    return {}


def render_sidebar_widgets(nasa_api_key: str = "DEMO_KEY"):
    with st.sidebar:
        # Daily quote
        quote, source = get_daily_quote()
        st.markdown(
            f"""<div style='padding:10px 12px;background:var(--bg-panel);border-radius:10px;
border-left:3px solid var(--accent-purple);margin-bottom:14px;'>
<div style='font-size:0.78rem;font-style:italic;color:var(--text-main);line-height:1.4;'>{quote}</div>
<div style='font-size:0.7rem;color:var(--text-soft);margin-top:5px;text-align:right;'>— {source}</div>
</div>""",
            unsafe_allow_html=True,
        )

        # NASA APOD
        apod = _fetch_apod(nasa_api_key)
        if apod:
            media_type = apod.get("media_type", "image")
            img_url = apod.get("thumbnail_url") or (apod.get("url") if media_type == "image" else "")
            title = apod.get("title", "Astronomy Picture of the Day")
            explanation = (apod.get("explanation") or "")[:200] + "..."
            if img_url:
                st.markdown(
                    f"""<div style='margin-bottom:14px;'>
<div style='font-size:0.72rem;color:var(--text-soft);margin-bottom:4px;'>🔭 NASA — Foto do Dia</div>
<img src='{img_url}' style='width:100%;border-radius:8px;' alt='{title}'/>
<div style='font-size:0.75rem;font-weight:600;color:var(--text-main);margin-top:5px;'>{title}</div>
<div style='font-size:0.7rem;color:var(--text-soft);line-height:1.35;margin-top:2px;'>{explanation}</div>
</div>""",
                    unsafe_allow_html=True,
                )

        # Upcoming astronomical events
        events = get_upcoming_astro_events()
        if events:
            st.markdown(
                "<div style='font-size:0.72rem;color:var(--text-soft);margin-bottom:4px;'>🌌 Próximos eventos astronômicos</div>",
                unsafe_allow_html=True,
            )
            lines = []
            for ev in events[:5]:
                badge = "Hoje! 🎉" if ev["days_away"] == 0 else f"em {ev['days_away']}d"
                lines.append(
                    f"<div style='display:flex;align-items:center;gap:6px;padding:3px 0;"
                    f"border-bottom:1px solid var(--divider);font-size:0.72rem;'>"
                    f"<span>{ev['icon']}</span>"
                    f"<span style='flex:1;color:var(--text-main);'>{ev['name']}</span>"
                    f"<span style='color:var(--accent-purple);white-space:nowrap;'>{badge}</span>"
                    f"</div>"
                )
            st.markdown("".join(lines), unsafe_allow_html=True)
            st.markdown("<div style='margin-bottom:10px;'></div>", unsafe_allow_html=True)
