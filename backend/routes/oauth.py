from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import require_user_email
from backend.settings import get_settings
from backend.services import google_calendar_service

router = APIRouter()


@router.get("/v1/oauth/google/connect")
async def google_connect(user_email: str = Depends(require_user_email)):
    settings = get_settings()
    if not settings.calendar_client_id:
        raise HTTPException(status_code=400, detail="Calendar OAuth not configured")
    url = google_calendar_service.build_connect_url(user_email)
    return {"url": url}


@router.get("/v1/oauth/google/callback")
async def google_callback(code: str, state: str):
    if not state:
        raise HTTPException(status_code=400, detail="Missing state")
    user_email = state
    await google_calendar_service.exchange_code_for_tokens(user_email, code)
    return {"ok": True}
