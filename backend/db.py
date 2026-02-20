from __future__ import annotations

import logging
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncEngine

from backend.settings import get_settings

logger = logging.getLogger(__name__)


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
        ssl_requested = False
        for key, value in query_items:
            if key == "sslmode":
                ssl_requested = True
                continue
            if key in {"channel_binding", "ssl"}:
                continue
            clean.append((key, value))
        if ssl_requested:
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
        connect_args: dict = {}
        try:
            parsed = urlparse(db_url)
            host = parsed.hostname or ""
            if host and host not in {"localhost", "127.0.0.1"}:
                connect_args["ssl"] = True
        except Exception:
            logger.debug("Failed to parse database URL for SSL hint.")
        engine_kwargs = {"pool_pre_ping": True, "future": True, "pool_size": 20, "max_overflow": 10}
        if connect_args:
            _engine = create_async_engine(db_url, connect_args=connect_args, **engine_kwargs)
        else:
            _engine = create_async_engine(db_url, **engine_kwargs)
    return _engine


def get_sessionmaker() -> async_sessionmaker:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory
