from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.auth import require_user_email
from backend import repositories

router = APIRouter()


@router.get("/v1/bootstrap")
async def bootstrap(user_email: str = Depends(require_user_email)):
    today_iso = __import__("datetime").date.today().isoformat()
    today_entry = await repositories.get_day_entry(user_email, today_iso)
    quick_indicators = {
        "pending_tasks": await repositories.count_pending_tasks(user_email, today_iso),
    }
    return {
        "user_email": user_email,
        "user_name": user_email.split("@")[0].title(),
        "allowed": True,
        "today_snapshot": today_entry,
        "quick_indicators": quick_indicators,
    }


@router.get("/v1/init")
async def init_payload(user_email: str = Depends(require_user_email)):
    today_iso = __import__("datetime").date.today().isoformat()
    today_entry = await repositories.get_day_entry(user_email, today_iso)
    pending_tasks = await repositories.count_pending_tasks(user_email, today_iso)
    meeting_days = await repositories.get_meeting_days(user_email)
    family_worship_day = await repositories.get_family_worship_day(user_email)
    partner = repositories.get_partner_email(user_email)
    shared_snapshot = {
        "today": today_iso,
        "habits": [],
        "summary": "Shared summary unavailable.",
    }
    if partner:
        shared_snapshot = await repositories.get_shared_habit_comparison(
            __import__("datetime").date.today(),
            user_email,
            partner,
            [
                "bible_reading",
                "meeting_attended",
                "prepare_meeting",
                "workout",
                "shower",
                "daily_text",
                "family_worship",
            ],
        )
    return {
        "user_email": user_email,
        "user_name": user_email.split("@")[0].title(),
        "allowed": True,
        "today_snapshot": today_entry,
        "quick_indicators": {"pending_tasks": pending_tasks},
        "pending_tasks": pending_tasks,
        "shared_snapshot": shared_snapshot,
        "meeting_days": meeting_days,
        "family_worship_day": family_worship_day,
    }
