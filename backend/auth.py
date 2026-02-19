from __future__ import annotations

from fastapi import Header, HTTPException

from backend.settings import get_settings


async def require_user_email(
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
    x_backend_token: str | None = Header(default=None, alias="X-Backend-Token"),
) -> str:
    settings = get_settings()
    if not x_backend_token or x_backend_token != settings.backend_session_secret:
        raise HTTPException(status_code=401, detail="Invalid backend token")
    if not x_user_email:
        raise HTTPException(status_code=401, detail="Missing user email")
    email = x_user_email.strip().lower()
    if settings.allowed_emails and email not in settings.allowed_emails:
        raise HTTPException(status_code=403, detail="User not allowed")
    return email
