from __future__ import annotations

from fastapi import FastAPI

from backend.db_init import init_db
from backend.routes import bootstrap, day, habits, tasks, calendar, sync, oauth, couple


def create_app() -> FastAPI:
    app = FastAPI(title="Life Dashboard API", version="0.1.0")

    app.include_router(bootstrap.router)
    app.include_router(day.router)
    app.include_router(habits.router)
    app.include_router(tasks.router)
    app.include_router(calendar.router)
    app.include_router(sync.router)
    app.include_router(oauth.router)
    app.include_router(couple.router)

    @app.on_event("startup")
    async def _startup():
        await init_db()

    @app.get("/health")
    async def health():
        return {"ok": True}

    return app


app = create_app()
