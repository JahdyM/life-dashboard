import base64
import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode, quote

import requests
import streamlit as st
from cryptography.fernet import Fernet

from dashboard.data import repositories

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"

_SECRET_GETTER = None


def configure(secret_getter):
    global _SECRET_GETTER
    _SECRET_GETTER = secret_getter


def _get_secret(path, default=None):
    if _SECRET_GETTER is None:
        return default
    return _SECRET_GETTER(path, default)


def _client_id():
    return _get_secret(("calendar_auth", "client_id")) or _get_secret(("auth", "google", "client_id"))


def _client_secret():
    return _get_secret(("calendar_auth", "client_secret")) or _get_secret(("auth", "google", "client_secret"))


def _redirect_uri():
    explicit = _get_secret(("calendar_auth", "redirect_uri"))
    if explicit:
        return str(explicit).strip()

    auth_redirect = _get_secret(("auth", "redirect_uri"))
    if not auth_redirect:
        return ""
    auth_redirect = str(auth_redirect).strip()
    if auth_redirect.endswith("/oauth2callback"):
        return auth_redirect[: -len("/oauth2callback")]
    return auth_redirect


def get_effective_redirect_uri():
    return _redirect_uri()


def _fernet():
    encryption_secret = _get_secret(("app", "GOOGLE_TOKEN_ENCRYPTION_KEY")) or _get_secret(("GOOGLE_TOKEN_ENCRYPTION_KEY",))
    if not encryption_secret:
        raise RuntimeError("Missing GOOGLE_TOKEN_ENCRYPTION_KEY")
    digest = hashlib.sha256(str(encryption_secret).encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def _encrypt(value):
    token = _fernet().encrypt(str(value).encode("utf-8"))
    return token.decode("utf-8")


def _decrypt(value):
    token = _fernet().decrypt(str(value).encode("utf-8"))
    return token.decode("utf-8")


def build_connect_url(user_email):
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": _client_id(),
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar",
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": f"{user_email}|{state}",
    }
    return f"{AUTH_URL}?{urlencode(params)}", state


def connect_from_code(user_email, code):
    payload = {
        "code": code,
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "redirect_uri": _redirect_uri(),
        "grant_type": "authorization_code",
    }
    response = requests.post(TOKEN_URL, data=payload, timeout=20)
    response.raise_for_status()
    token_data = response.json()

    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        existing = repositories.get_google_tokens(user_email)
        if existing and existing.get("refresh_token_enc"):
            refresh_token = _decrypt(existing["refresh_token_enc"])
        else:
            raise RuntimeError("Google OAuth did not return refresh_token")

    access_token = token_data.get("access_token")
    expires_in = int(token_data.get("expires_in", 3600) or 3600)
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in - 30)).isoformat()
    scope = token_data.get("scope")

    repositories.store_google_tokens(
        user_email,
        _encrypt(refresh_token),
        access_token=access_token,
        expires_at=expires_at,
        scope=scope,
    )


def _refresh_access_token(user_email):
    token_row = repositories.get_google_tokens(user_email)
    if not token_row:
        return None
    refresh_enc = token_row.get("refresh_token_enc")
    if not refresh_enc:
        return None

    refresh_token = _decrypt(refresh_enc)
    payload = {
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    response = requests.post(TOKEN_URL, data=payload, timeout=20)
    response.raise_for_status()
    token_data = response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        return None
    expires_in = int(token_data.get("expires_in", 3600) or 3600)
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in - 30)).isoformat()

    repositories.update_google_access_token(
        user_email,
        access_token,
        expires_at,
        scope=token_data.get("scope"),
    )
    return access_token


def get_access_token(user_email):
    token_row = repositories.get_google_tokens(user_email)
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

    return _refresh_access_token(user_email)


def is_connected(user_email):
    return repositories.get_google_tokens(user_email) is not None


def _google_headers(user_email):
    access_token = get_access_token(user_email)
    if not access_token:
        raise RuntimeError("Google Calendar token unavailable")
    return {"Authorization": f"Bearer {access_token}"}


def _parse_google_event(calendar_id, event):
    start_raw = event.get("start", {})
    end_raw = event.get("end", {})

    start_date = None
    end_date = None
    start_time = None
    end_time = None
    is_all_day = False

    if "dateTime" in start_raw:
        start_dt = datetime.fromisoformat(start_raw["dateTime"].replace("Z", "+00:00"))
        start_date = start_dt.date()
        start_time = start_dt.strftime("%H:%M")
        if "dateTime" in end_raw:
            end_dt = datetime.fromisoformat(end_raw["dateTime"].replace("Z", "+00:00"))
            end_date = end_dt.date()
            end_time = end_dt.strftime("%H:%M")
        else:
            end_date = start_date
    else:
        is_all_day = True
        start_date = date.fromisoformat(start_raw.get("date"))
        end_date = date.fromisoformat(end_raw.get("date")) if end_raw.get("date") else start_date

    title = event.get("summary") or "Untitled event"
    event_id = event.get("id")
    event_key = f"google::{calendar_id}::{event_id}"

    return {
        "event_key": event_key,
        "calendar_id": calendar_id,
        "event_id": event_id,
        "title": title,
        "start_date": start_date,
        "end_date": end_date,
        "start_time": start_time,
        "end_time": end_time,
        "is_all_day": is_all_day,
        "source": "google_api",
    }


@st.cache_data(ttl=120, show_spinner=False)
def _list_events_for_range_cached(user_email, start_iso, end_iso, calendar_ids_tuple):
    start_day = date.fromisoformat(start_iso)
    end_day = date.fromisoformat(end_iso)
    calendar_ids = list(calendar_ids_tuple)

    events = []
    headers = _google_headers(user_email)

    time_min = datetime.combine(start_day, datetime.min.time(), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    time_max = datetime.combine(end_day + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

    for calendar_id in calendar_ids:
        endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events"
        params = {
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 250,
        }
        response = requests.get(endpoint, headers=headers, params=params, timeout=25)
        response.raise_for_status()
        payload = response.json()
        for event in payload.get("items", []):
            if event.get("status") == "cancelled":
                continue
            events.append(_parse_google_event(calendar_id, event))

    events.sort(key=lambda item: (item["start_date"], item.get("start_time") is None, item.get("start_time") or "23:59", item["title"]))
    return events


def list_events_for_range(user_email, start_day, end_day, calendar_ids):
    return _list_events_for_range_cached(
        user_email,
        start_day.isoformat(),
        end_day.isoformat(),
        tuple(calendar_ids),
    )


def clear_event_cache():
    _list_events_for_range_cached.clear()


def create_event(user_email, calendar_id, payload):
    endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events"
    headers = _google_headers(user_email)
    headers["Content-Type"] = "application/json"
    response = requests.post(endpoint, headers=headers, json=payload, timeout=20)
    response.raise_for_status()
    clear_event_cache()
    return response.json()


def update_event(user_email, calendar_id, event_id, patch):
    endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events/{quote(event_id, safe='')}"
    headers = _google_headers(user_email)
    headers["Content-Type"] = "application/json"
    response = requests.patch(endpoint, headers=headers, json=patch, timeout=20)
    response.raise_for_status()
    clear_event_cache()
    return response.json()


def delete_event(user_email, calendar_id, event_id):
    endpoint = f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events/{quote(event_id, safe='')}"
    headers = _google_headers(user_email)
    response = requests.delete(endpoint, headers=headers, timeout=20)
    if response.status_code not in {200, 204}:
        response.raise_for_status()
    clear_event_cache()


# Backward-compatible names
def google_update_event(user_email, calendar_id, event_id, patch):
    return update_event(user_email, calendar_id, event_id, patch)


def google_delete_event(user_email, calendar_id, event_id):
    return delete_event(user_email, calendar_id, event_id)
