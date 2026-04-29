from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.db_init import init_db
from backend.routes import bootstrap, day, habits, tasks, calendar, sync, oauth, couple, entries, settings, header


def _build_allowed_origins() -> list[str]:
    raw = os.getenv(
        "ALLOWED_ORIGINS",
        "https://jahdy-gui-dashboard.streamlit.app",
    )
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if os.getenv("ENVIRONMENT", "production").lower() == "development":
        origins += ["http://localhost:8501", "http://localhost:3000"]
    return origins


def create_app() -> FastAPI:
    logging.basicConfig(
        level=os.getenv("BACKEND_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )
    app = FastAPI(title="Life Dashboard API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_build_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(bootstrap.router)
    app.include_router(day.router)
    app.include_router(habits.router)
    app.include_router(tasks.router)
    app.include_router(calendar.router)
    app.include_router(sync.router)
    app.include_router(oauth.router)
    app.include_router(couple.router)
    app.include_router(entries.router)
    app.include_router(settings.router)
    app.include_router(header.router)

    @app.on_event("startup")
    async def _startup():
        await init_db()

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception):
        logging.getLogger("backend").exception("Unhandled exception: %s", exc)
        return JSONResponse(status_code=500, content={"detail": "Internal error"})

    @app.get("/health")
    async def health():
        return {"ok": True}

    return app


app = create_app()
