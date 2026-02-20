from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from backend.auth import require_user_email
from backend import repositories

router = APIRouter()


@router.get("/v1/entries")
async def list_entries(
    start: date = Query(...),
    end: date = Query(...),
    user_email: str = Depends(require_user_email),
):
    items = await repositories.list_entries_range(user_email, start.isoformat(), end.isoformat())
    return {"items": items}
