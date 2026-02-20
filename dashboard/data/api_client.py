import os
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

_SECRET_GETTER = None
_USER_GETTER = None


def _build_session():
    session = requests.Session()
    retry = Retry(
        total=2,
        backoff_factor=0.5,
        status_forcelist=(502, 503, 504),
        allowed_methods=("GET", "POST", "PUT", "PATCH", "DELETE"),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


_SESSION = _build_session()


def configure(secret_getter, user_getter):
    global _SECRET_GETTER, _USER_GETTER
    _SECRET_GETTER = secret_getter
    _USER_GETTER = user_getter


def _get_secret(path, default=None):
    if _SECRET_GETTER is None:
        return default
    return _SECRET_GETTER(path, default)


def api_base_url():
    return (
        _get_secret(("app", "API_BASE_URL"))
        or _get_secret(("API_BASE_URL",))
        or os.getenv("API_BASE_URL")
        or ""
    )


def backend_token():
    return (
        _get_secret(("app", "BACKEND_SESSION_SECRET"))
        or _get_secret(("BACKEND_SESSION_SECRET",))
        or os.getenv("BACKEND_SESSION_SECRET")
        or ""
    )


def is_enabled():
    return bool(api_base_url() and backend_token())


def request(method: str, path: str, params: dict | None = None, json: dict | None = None, timeout: int = 10) -> Any:
    base = api_base_url().rstrip("/")
    if not base:
        raise RuntimeError("API_BASE_URL not configured")
    token = backend_token()
    if not token:
        raise RuntimeError("BACKEND_SESSION_SECRET not configured")
    user_email = _USER_GETTER() if _USER_GETTER else None
    if not user_email:
        raise RuntimeError("Missing user email for API request")
    headers = {
        "X-User-Email": user_email,
        "X-Backend-Token": token,
    }
    url = f"{base}{path}"
    response = _SESSION.request(method, url, params=params, json=json, headers=headers, timeout=timeout)
    if not response.ok:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise RuntimeError(f"API error {response.status_code} {response.reason}: {detail}")
    if response.status_code == 204:
        return None
    return response.json()
