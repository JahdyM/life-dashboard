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
        "pending_tasks": 0,
    }
    return {
        "user_email": user_email,
        "user_name": user_email.split("@")[0].title(),
        "allowed": True,
        "today_snapshot": today_entry,
        "quick_indicators": quick_indicators,
    }
