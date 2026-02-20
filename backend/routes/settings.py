from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import require_user_email
from backend import repositories
from backend.schemas import MeetingDaysPayload, FamilyWorshipPayload

router = APIRouter()


@router.get("/v1/settings/meeting-days")
async def get_meeting_days(user_email: str = Depends(require_user_email)):
    days = await repositories.get_meeting_days(user_email)
    return {"days": days}


@router.put("/v1/settings/meeting-days")
async def set_meeting_days(payload: MeetingDaysPayload, user_email: str = Depends(require_user_email)):
    if not all(isinstance(day, int) and 0 <= day <= 6 for day in payload.days):
        raise HTTPException(status_code=400, detail="Invalid meeting day index")
    await repositories.set_meeting_days(user_email, payload.days)
    return {"ok": True}


@router.get("/v1/settings/family-worship-day")
async def get_family_worship_day(user_email: str = Depends(require_user_email)):
    day_value = await repositories.get_family_worship_day(user_email)
    return {"day": day_value}


@router.put("/v1/settings/family-worship-day")
async def set_family_worship_day(payload: FamilyWorshipPayload, user_email: str = Depends(require_user_email)):
    if not isinstance(payload.day, int) or not (0 <= payload.day <= 6):
        raise HTTPException(status_code=400, detail="Invalid family worship day index")
    await repositories.set_family_worship_day(user_email, payload.day)
    return {"ok": True}
