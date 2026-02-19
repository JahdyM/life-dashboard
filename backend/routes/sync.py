from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.auth import require_user_email
from backend import repositories
from backend.workers.sync_worker import process_outbox_once

router = APIRouter()


@router.get("/v1/sync/status")
async def sync_status(user_email: str = Depends(require_user_email)):
    token = await repositories.get_google_tokens(user_email)
    return {
        "connected": bool(token),
        "last_synced_at": token.get("updated_at") if token else None,
        "last_error": None,
    }


@router.post("/v1/sync/run")
async def run_sync_once(user_email: str = Depends(require_user_email)):
    drained = await process_outbox_once(limit=25)
    return {"ok": True, "outbox_drained": drained}
