from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException

from backend.auth import require_user_email
from backend import repositories

router = APIRouter()


@router.get("/v1/entries")
async def list_entries(
    start: date = Query(...),
    end: date = Query(...),
    user_email: str = Depends(require_user_email),
):
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    items = await repositories.list_entries_range(user_email, start.isoformat(), end.isoformat())
    return {"items": items}
