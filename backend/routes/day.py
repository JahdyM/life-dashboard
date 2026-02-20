from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from datetime import date as dt_date

from backend.auth import require_user_email
from backend.schemas import DayEntryPatch
from backend import repositories

router = APIRouter()


@router.get("/v1/day/{day}")
async def get_day(day: str, user_email: str = Depends(require_user_email)):
    try:
        dt_date.fromisoformat(day)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")
    payload = await repositories.get_day_entry(user_email, day)
    return {"date": day, "user_email": user_email, "data": payload}


@router.patch("/v1/day/{day}")
async def patch_day(day: str, patch: DayEntryPatch, user_email: str = Depends(require_user_email)):
    try:
        dt_date.fromisoformat(day)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")
    data = patch.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No changes provided")
    await repositories.patch_day_entry(user_email, day, data)
    return {"ok": True}
