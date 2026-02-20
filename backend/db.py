from __future__ import annotations

from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncEngine

from backend.settings import get_settings


def _normalize_database_url(database_url: str) -> str:
    url = str(database_url or "").strip()
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    elif url.startswith("postgresql+psycopg2://"):
        url = "postgresql+asyncpg://" + url[len("postgresql+psycopg2://") :]
    try:
        parsed = urlparse(url)
        query_items = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)]
        clean = []
        has_ssl = False
        for key, value in query_items:
            if key == "channel_binding":
                continue
            if key == "sslmode":
                # asyncpg does not accept sslmode; convert to ssl=true
                has_ssl = True
                continue
            if key == "ssl":
                has_ssl = True
            clean.append((key, value))
        if has_ssl:
            clean = [(k, v) for k, v in clean if k != "ssl"]
            clean.append(("ssl", "true"))
        parsed = parsed._replace(query=urlencode(clean))
        url = urlunparse(parsed)
    except Exception:
        return url
    return url


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        db_url = _normalize_database_url(settings.database_url)
        _engine = create_async_engine(db_url, pool_pre_ping=True, future=True)
    return _engine


def get_sessionmaker() -> async_sessionmaker:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory
