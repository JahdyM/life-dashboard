from __future__ import annotations

import calendar
from datetime import date, timedelta
import math

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import require_user_email
from backend import repositories
from backend.settings import get_settings

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
    partner = repositories.get_partner_email(user_email)
    if not partner:
        return {"today": date.today().isoformat(), "habits": [], "summary": "Shared summary unavailable."}
    snapshot = await repositories.get_shared_habit_comparison(date.today(), user_email, partner, SHARED_HABITS)
    return snapshot


@router.get("/v1/couple/moodboard")
async def couple_moodboard(
    range: str = Query("month"),
    month: str | None = Query(None),
    year: int | None = Query(None),
    user_email: str = Depends(require_user_email),
):
    settings = get_settings()
    if len(settings.allowed_emails) >= 2:
        user_a = settings.allowed_emails[0]
        user_b = settings.allowed_emails[1]
    else:
        user_a = user_email
        user_b = repositories.get_partner_email(user_email)

    def _label(email: str) -> str:
        lowered = (email or "").lower()
        if lowered.startswith("jahdy"):
            return "Jahdy"
        if lowered.startswith("guilherme"):
            return "Guilherme"
        return (email or "Partner").split("@")[0].title()

    def _empty_moodboard(start: date, end: date, label_a: str, label_b: str, warning: str | None = None):
        total_slots = (end - start).days + 1
        if range == "month":
            x_labels = [str(day) for day in range(1, total_slots + 1)]
        else:
            x_labels = [
                (start + timedelta(days=i)).strftime("%b") if (start + timedelta(days=i)).day == 1 else ""
                for i in range(total_slots)
            ]
        z = [[math.nan for _ in range(total_slots)] for _ in range(2)]
        hover_text = [["" for _ in range(total_slots)] for _ in range(2)]
        payload = {
            "x_labels": x_labels,
            "y_labels": [label_a, label_b],
            "z": z,
            "hover_text": hover_text,
        }
        if warning:
            payload["warning"] = warning
        return payload
    if range not in {"month", "year"}:
        raise HTTPException(status_code=400, detail="Invalid range")

    if range == "month":
        try:
            if month:
                month_date = date.fromisoformat(f"{month}-01")
            else:
                month_date = date.today().replace(day=1)
        except Exception:
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

    if not user_b:
        return _empty_moodboard(start, end, _label(user_a), "Partner", warning="Partner not configured")

    feed = await repositories.get_couple_mood_feed(user_a, user_b, start, end)
    moods = ["Paz", "Felicidade", "Ansiedade", "Medo", "Raiva", "Neutro"]
    mood_to_int = {m: i for i, m in enumerate(moods)}

    total_slots = len(x_labels)
    z = [[float("nan") for _ in range(total_slots)] for _ in range(2)]
    hover_text = [["" for _ in range(total_slots)] for _ in range(2)]
    row_meta = [(0, user_a, _label(user_a)), (1, user_b, _label(user_b))]
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
        "y_labels": [row_meta[0][2], row_meta[1][2]],
        "z": z,
        "hover_text": hover_text,
    }
