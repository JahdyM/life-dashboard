from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.auth import require_user_email
from backend import repositories

router = APIRouter()


@router.get("/v1/sync/status")
async def sync_status(user_email: str = Depends(require_user_email)):
    token = await repositories.get_google_tokens(user_email)
    return {
        "connected": bool(token),
        "last_synced_at": token.get("updated_at") if token else None,
        "last_error": None,
    }
