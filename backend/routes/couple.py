from __future__ import annotations

import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import require_user_email
from backend import repositories

router = APIRouter()

SHARED_HABITS = [
    "bible_reading",
    "meeting_attended",
    "prepare_meeting",
    "workout",
    "shower",
    "daily_text",
    "family_worship",
]


@router.get("/v1/couple/streaks")
async def couple_streaks(user_email: str = Depends(require_user_email)):
    partner = "guilherme.m.rods@gmail.com" if user_email == "jahdy.moreno@gmail.com" else "jahdy.moreno@gmail.com"
    snapshot = await repositories.get_shared_habit_comparison(date.today(), user_email, partner, SHARED_HABITS)
    return snapshot


@router.get("/v1/couple/moodboard")
async def couple_moodboard(
    range: str = Query("month"),
    month: str | None = Query(None),
    year: int | None = Query(None),
    user_email: str = Depends(require_user_email),
):
    user_a = "jahdy.moreno@gmail.com"
    user_b = "guilherme.m.rods@gmail.com"
    if range not in {"month", "year"}:
        raise HTTPException(status_code=400, detail="Invalid range")

    if range == "month":
        if month:
            month_date = date.fromisoformat(f"{month}-01")
        else:
            month_date = date.today().replace(day=1)
        start = month_date.replace(day=1)
        last = calendar.monthrange(start.year, start.month)[1]
        end = start.replace(day=last)
        x_labels = [str(day) for day in range(1, last + 1)]
    else:
        year_value = year or date.today().year
        start = date(year_value, 1, 1)
        end = date(year_value, 12, 31)
        total_days = (end - start).days + 1
        x_labels = [(start + timedelta(days=i)).strftime("%b") if (start + timedelta(days=i)).day == 1 else "" for i in range(total_days)]

    feed = await repositories.get_couple_mood_feed(user_a, user_b, start, end)
    moods = ["Paz", "Felicidade", "Ansiedade", "Medo", "Raiva", "Neutro"]
    mood_to_int = {m: i for i, m in enumerate(moods)}

    total_slots = len(x_labels)
    z = [[float("nan") for _ in range(total_slots)] for _ in range(2)]
    hover_text = [["" for _ in range(total_slots)] for _ in range(2)]
    row_meta = [(0, user_a, "Jahdy"), (1, user_b, "Guilherme")]
    by_key = {(row["user_email"], str(row["date"])): row["mood_category"] for row in feed}

    for row_idx, email, label in row_meta:
        for idx in range(total_slots):
            current = start + timedelta(days=idx)
            mood = by_key.get((email, current.isoformat()))
            if mood in mood_to_int:
                z[row_idx][idx] = mood_to_int[mood]
                hover_text[row_idx][idx] = f"{current.isoformat()} • {label}: {mood}"
            else:
                hover_text[row_idx][idx] = f"{current.isoformat()} • {label}: no entry"

    return {
        "x_labels": x_labels,
        "y_labels": ["Jahdy", "Guilherme"],
        "z": z,
        "hover_text": hover_text,
    }
