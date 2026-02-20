from __future__ import annotations

import os
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import streamlit as st
from sqlalchemy import create_engine

from dashboard.constants import (
    SHARED_USER_EMAILS,
    USER_PROFILES,
    JAHDY_EMAIL,
    GUILHERME_EMAIL,
)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "life_dashboard.db")
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
LOCAL_SECRETS_PATH = os.path.join(os.path.dirname(__file__), "..", ".streamlit", "secrets.toml")

ENV_FALLBACK_KEYS = {
    ("auth", "redirect_uri"): "AUTH_REDIRECT_URI",
    ("auth", "cookie_secret"): "AUTH_COOKIE_SECRET",
    ("auth", "google", "client_id"): "GOOGLE_CLIENT_ID",
    ("auth", "google", "client_secret"): "GOOGLE_CLIENT_SECRET",
    ("auth", "google", "server_metadata_url"): "GOOGLE_SERVER_METADATA_URL",
    ("app", "allowed_email"): "ALLOWED_EMAIL",
    ("app", "allowed_emails"): "ALLOWED_EMAILS",
    ("database", "url"): "DATABASE_URL",
}


def load_local_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def bootstrap_local_secrets_from_env():
    if os.path.exists(LOCAL_SECRETS_PATH):
        return
    required = [
        "AUTH_REDIRECT_URI",
        "AUTH_COOKIE_SECRET",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
    ]
    if not all(os.getenv(key) for key in required):
        return
    os.makedirs(os.path.dirname(LOCAL_SECRETS_PATH), exist_ok=True)
    metadata_url = os.getenv(
        "GOOGLE_SERVER_METADATA_URL",
        "https://accounts.google.com/.well-known/openid-configuration",
    )
    database_url = os.getenv("DATABASE_URL", "")
    allowed_email = (os.getenv("ALLOWED_EMAIL") or "").strip()
    allowed_emails = (os.getenv("ALLOWED_EMAILS") or "").strip()
    with open(LOCAL_SECRETS_PATH, "w", encoding="utf-8") as secrets_file:
        secrets_file.write("[auth]\n")
        secrets_file.write(f"redirect_uri = \"{os.getenv('AUTH_REDIRECT_URI')}\"\n")
        secrets_file.write(f"cookie_secret = \"{os.getenv('AUTH_COOKIE_SECRET')}\"\n\n")
        secrets_file.write("[auth.google]\n")
        secrets_file.write(f"client_id = \"{os.getenv('GOOGLE_CLIENT_ID')}\"\n")
        secrets_file.write(f"client_secret = \"{os.getenv('GOOGLE_CLIENT_SECRET')}\"\n")
        secrets_file.write(f"server_metadata_url = \"{metadata_url}\"\n\n")
        if allowed_email or allowed_emails:
            secrets_file.write("[app]\n")
            if allowed_emails:
                secrets_file.write(f"allowed_emails = \"{allowed_emails}\"\n")
            elif allowed_email:
                secrets_file.write(f"allowed_email = \"{allowed_email}\"\n")
            secrets_file.write("\n")
        if database_url:
            secrets_file.write("[database]\n")
            secrets_file.write(f"url = \"{database_url}\"\n")


def get_secret(path, default=None):
    env_key = ENV_FALLBACK_KEYS.get(tuple(path))
    if env_key:
        env_value = os.getenv(env_key)
        if env_value:
            return env_value
    current = st.secrets
    for key in path:
        try:
            if key not in current:
                return default
            current = current[key]
        except Exception:
            return default
    return current


def normalize_database_url(database_url):
    url = str(database_url or "").strip()
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://") :]

    try:
        parsed = urlparse(url)
        if "channel_binding=" in (parsed.query or ""):
            query_items = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k != "channel_binding"]
            parsed = parsed._replace(query=urlencode(query_items))
            url = urlunparse(parsed)
    except Exception:
        return url
    return url


def get_database_url():
    raw_value = (
        get_secret(("database", "url"))
        or get_secret(("DATABASE_URL",))
        or os.getenv("DATABASE_URL")
        or ""
    )
    database_url = normalize_database_url(str(raw_value).strip())
    if database_url and database_url.lower() not in {"none", "null"}:
        return database_url
    return f"sqlite:///{DB_PATH}"


def using_local_sqlite(database_url):
    return str(database_url).strip().lower().startswith("sqlite")


def describe_database_target(database_url):
    url = str(database_url or "").strip()
    if using_local_sqlite(url):
        return "sqlite:///life_dashboard.db (local file)"
    if not url:
        return "(empty)"
    parsed = urlparse(url)
    host = parsed.hostname or "unknown-host"
    port = f":{parsed.port}" if parsed.port else ""
    db_name = parsed.path.lstrip("/") or "database"
    return f"{parsed.scheme}://{host}{port}/{db_name}"


def show_database_connection_error(exc):
    db_url = get_database_url()
    placeholder_tokens = ["USER", "PASSWORD", "HOST", "DBNAME", "host:5432/DBNAME"]
    has_placeholder = any(token in str(db_url) for token in placeholder_tokens)
    st.error("Database connection failed.")
    st.markdown(
        "I could not connect to your configured database target:\n"
        f"`{describe_database_target(db_url)}`"
    )
    if has_placeholder:
        st.warning(
            "Your database URL still contains template placeholders. Replace USER, PASSWORD, HOST, and DBNAME "
            "with real values from Neon/Supabase."
        )
    st.markdown(
        "Check `Settings -> Secrets` and make sure `[database].url` is valid and active.\n"
        "Use this format:"
    )
    st.code(
        "[database]\n"
        "url = \"postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require\"",
        language="toml",
    )
    st.caption(f"Technical detail: {type(exc).__name__}")
    st.stop()


def running_on_streamlit_cloud():
    redirect_uri = str(get_secret(("auth", "redirect_uri")) or "").strip().lower()
    return ".streamlit.app/" in redirect_uri


def enforce_persistent_storage_on_cloud(api_enabled=False):
    database_url = get_database_url()
    if running_on_streamlit_cloud() and (not api_enabled) and using_local_sqlite(database_url):
        st.error(
            "Persistent storage is required. This app is currently using temporary SQLite and "
            "new entries can be lost after reboot."
        )
        st.markdown(
            "Set this in Streamlit Cloud Secrets and reboot once:\n\n"
            "```toml\n"
            "[database]\n"
            "url = \"postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require\"\n"
            "```"
        )
        st.stop()


def render_data_persistence_notice(storage_message=None):
    if storage_message:
        st.caption(storage_message)


def auth_configured():
    return bool(
        get_secret(("auth", "redirect_uri"))
        and get_secret(("auth", "cookie_secret"))
        and get_secret(("auth", "google", "client_id"))
        and get_secret(("auth", "google", "client_secret"))
    )


def enforce_google_login():
    if not auth_configured():
        st.markdown("<div class='section-title'>Google Login Setup Required</div>", unsafe_allow_html=True)
        st.markdown("Configure Google OAuth in Streamlit Cloud secrets before using the app.")
        st.code(
            "[auth]\n"
            "redirect_uri = \"https://jahdy-gui-dashboard.streamlit.app/oauth2callback\"\n"
            "cookie_secret = \"LONG_RANDOM_SECRET\"\n\n"
            "[auth.google]\n"
            "client_id = \"YOUR_CLIENT_ID\"\n"
            "client_secret = \"YOUR_CLIENT_SECRET\"\n"
            "server_metadata_url = \"https://accounts.google.com/.well-known/openid-configuration\"\n\n"
            "[app]\n"
            "allowed_emails = \"jahdy.moreno@gmail.com,guilherme.m.rods@gmail.com\"",
            language="toml",
        )
        st.stop()

    allowed_raw = (
        get_secret(("app", "allowed_emails"))
        or get_secret(("app", "allowed_email"))
        or os.getenv("ALLOWED_EMAILS")
        or os.getenv("ALLOWED_EMAIL")
        or ""
    )
    allowed_set = {
        email.strip().lower()
        for email in str(allowed_raw).split(",")
        if email.strip()
    }
    if allowed_set:
        allowed_set = allowed_set | SHARED_USER_EMAILS
    else:
        allowed_set = set(SHARED_USER_EMAILS)

    redirect_uri = (get_secret(("auth", "redirect_uri")) or "").strip()
    parsed_uri = urlparse(redirect_uri) if redirect_uri else None
    if not redirect_uri or parsed_uri.path != "/oauth2callback":
        st.error(
            "Invalid auth.redirect_uri. For Streamlit st.login it must end with "
            "/oauth2callback (example: https://jahdy-gui-dashboard.streamlit.app/oauth2callback)."
        )
        st.stop()

    if not st.user.is_logged_in:
        st.markdown("<div class='section-title'>Login Required</div>", unsafe_allow_html=True)
        st.markdown("Use your Google account to access your private dashboard.")
        if st.button("Login with Google", key="google_login"):
            st.login("google")
        st.stop()

    user_email = str(getattr(st.user, "email", "")).strip().lower()
    if allowed_set and user_email not in allowed_set:
        st.error("Access denied for this account.")
        if st.button("Logout", key="logout_denied"):
            st.logout()
        st.stop()

    with st.sidebar:
        st.caption(f"Logged as: {getattr(st.user, 'email', 'unknown')}")
        if st.button("Logout", key="logout_sidebar"):
            st.logout()


def get_current_user_email():
    user_email = str(getattr(st.user, "email", "")).strip().lower()
    if user_email:
        return user_email
    allowed_many = (
        get_secret(("app", "allowed_emails"))
        or os.getenv("ALLOWED_EMAILS")
        or ""
    ).strip()
    fallback_from_many = ""
    if allowed_many:
        fallback_from_many = allowed_many.split(",")[0].strip().lower()
    fallback_email = (
        fallback_from_many
        or get_secret(("app", "allowed_email"))
        or os.getenv("ALLOWED_EMAIL")
        or "local@offline"
    ).strip().lower()
    return fallback_email or "local@offline"


def get_display_name(user_email):
    profile_name = USER_PROFILES.get(user_email, {}).get("name")
    if profile_name:
        return profile_name
    user_name = str(getattr(st.user, "name", "")).strip()
    if user_name:
        return user_name.split()[0]
    local = (user_email or "").split("@")[0].replace(".", " ").strip()
    return local.title() if local else "User"


def get_partner_email(user_email):
    if user_email == JAHDY_EMAIL:
        return GUILHERME_EMAIL
    if user_email == GUILHERME_EMAIL:
        return JAHDY_EMAIL
    return None


def scoped_setting_key(key):
    return f"{get_current_user_email()}::{key}"


@st.cache_resource
def get_engine(database_url):
    if database_url.startswith("sqlite"):
        return create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            future=True,
        )
    return create_engine(database_url, pool_pre_ping=True, future=True)
