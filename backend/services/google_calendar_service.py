from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, quote

import httpx
from cryptography.fernet import Fernet

from backend.settings import get_settings
from backend import repositories

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"


def _fernet() -> Fernet:
    settings = get_settings()
    digest = hashlib.sha256(settings.google_token_encryption_key.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_token(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_token(value: str) -> str:
    return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")


def build_connect_url(user_email: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.calendar_client_id,
        "redirect_uri": settings.calendar_redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar",
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": user_email,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(user_email: str, code: str) -> None:
    settings = get_settings()
    payload = {
        "code": code,
        "client_id": settings.calendar_client_id,
        "client_secret": settings.calendar_client_secret,
        "redirect_uri": settings.calendar_redirect_uri,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(TOKEN_URL, data=payload)
    response.raise_for_status()
    token_data = response.json()
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        existing = await repositories.get_google_tokens(user_email)
        if existing and existing.get("refresh_token_enc"):
            refresh_token = decrypt_token(existing["refresh_token_enc"])
        else:
            raise RuntimeError("Google OAuth did not return refresh_token")
    access_token = token_data.get("access_token")
    expires_in = int(token_data.get("expires_in", 3600) or 3600)
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in - 30)).isoformat()
    scope = token_data.get("scope")
    await repositories.store_google_tokens(
        user_email,
        encrypt_token(refresh_token),
        access_token=access_token,
        expires_at=expires_at,
        scope=scope,
    )


async def _refresh_access_token(user_email: str) -> str | None:
    token_row = await repositories.get_google_tokens(user_email)
    if not token_row:
        return None
    refresh_enc = token_row.get("refresh_token_enc")
    if not refresh_enc:
        return None
    refresh_token = decrypt_token(refresh_enc)
    settings = get_settings()
    payload = {
        "client_id": settings.calendar_client_id,
        "client_secret": settings.calendar_client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(TOKEN_URL, data=payload)
    response.raise_for_status()
    token_data = response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        return None
    expires_in = int(token_data.get("expires_in", 3600) or 3600)
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in - 30)).isoformat()
    await repositories.update_google_access_token(user_email, access_token, expires_at, token_data.get("scope"))
    return access_token


async def get_access_token(user_email: str) -> str | None:
    token_row = await repositories.get_google_tokens(user_email)
    if not token_row:
        return None
    access_token = token_row.get("access_token")
    expires_at = token_row.get("expires_at")
    if access_token and expires_at:
        try:
            expires_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        except Exception:
            expires_dt = None
        if expires_dt and expires_dt > datetime.now(timezone.utc):
            return access_token
    return await _refresh_access_token(user_email)


async def _google_headers(user_email: str) -> dict:
    access_token = await get_access_token(user_email)
    if not access_token:
        raise RuntimeError("Google Calendar token unavailable")
    return {"Authorization": f"Bearer {access_token}"}


async def list_events(
    user_email: str,
    calendar_id: str,
    time_min: str,
    time_max: str,
    sync_token: str | None = None,
) -> dict:
    headers = await _google_headers(user_email)
    endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events"
    params = {
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": 250,
    }
    if sync_token:
        params["syncToken"] = sync_token
    else:
        params["timeMin"] = time_min
        params["timeMax"] = time_max
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.get(endpoint, headers=headers, params=params)
    if response.status_code >= 400:
        try:
            payload = response.json()
            message = payload.get("error", {}).get("message") or payload.get("message") or response.text
        except Exception:
            message = response.text
        raise RuntimeError(f"Calendar API error ({response.status_code}): {message}")
    return response.json()


async def create_event(user_email: str, calendar_id: str, payload: dict) -> dict:
    headers = await _google_headers(user_email)
    headers["Content-Type"] = "application/json"
    endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(endpoint, headers=headers, json=payload)
    if response.status_code >= 400:
        try:
            payload_err = response.json()
            message = payload_err.get("error", {}).get("message") or payload_err.get("message") or response.text
        except Exception:
            message = response.text
        raise RuntimeError(f"Google create_event failed ({response.status_code}): {message}")
    return response.json()


async def update_event(user_email: str, calendar_id: str, event_id: str, patch: dict) -> dict:
    headers = await _google_headers(user_email)
    headers["Content-Type"] = "application/json"
    endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events/{quote(event_id, safe='')}"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.patch(endpoint, headers=headers, json=patch)
    if response.status_code >= 400:
        try:
            payload_err = response.json()
            message = payload_err.get("error", {}).get("message") or payload_err.get("message") or response.text
        except Exception:
            message = response.text
        raise RuntimeError(f"Google update_event failed ({response.status_code}): {message}")
    return response.json()


async def delete_event(user_email: str, calendar_id: str, event_id: str) -> None:
    headers = await _google_headers(user_email)
    endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events/{quote(event_id, safe='')}"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.delete(endpoint, headers=headers)
    if response.status_code not in {200, 204}:
        response.raise_for_status()


async def get_calendar_timezone(user_email: str, calendar_id: str) -> str:
    headers = await _google_headers(user_email)
    endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(endpoint, headers=headers)
    if response.status_code >= 400:
        try:
            payload_err = response.json()
            message = payload_err.get("error", {}).get("message") or payload_err.get("message") or response.text
        except Exception:
            message = response.text
        raise RuntimeError(f"Google calendar fetch failed ({response.status_code}): {message}")
    payload = response.json()
    tz = payload.get("timeZone")
    if tz:
        return str(tz)
    return get_settings().calendar_timezone
