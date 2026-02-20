from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

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


@router.get("/v1/header")
async def header_snapshot(user_email: str = Depends(require_user_email)):
    today = date.today()
    pending_tasks = await repositories.count_pending_tasks(user_email, today.isoformat())
    partner = repositories.get_partner_email(user_email)
    shared_snapshot = {
        "today": today.isoformat(),
        "habits": [],
        "summary": "Shared summary unavailable.",
    }
    if partner:
        shared_snapshot = await repositories.get_shared_habit_comparison(today, user_email, partner, SHARED_HABITS)
    return {
        "today": today.isoformat(),
        "pending_tasks": pending_tasks,
        "shared_snapshot": shared_snapshot,
    }
