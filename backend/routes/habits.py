from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import require_user_email
from backend import repositories
from backend.schemas import CustomHabitCreate, CustomHabitDonePayload

router = APIRouter()


@router.get("/v1/habits/custom")
async def list_custom_habits(user_email: str = Depends(require_user_email)):
    return {"items": await repositories.list_custom_habits(user_email)}


@router.post("/v1/habits/custom")
async def create_custom_habit(payload: CustomHabitCreate, user_email: str = Depends(require_user_email)):
    try:
        habit = await repositories.add_custom_habit(user_email, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return habit


@router.patch("/v1/habits/custom/{habit_id}")
async def update_custom_habit(habit_id: str, payload: CustomHabitCreate, user_email: str = Depends(require_user_email)):
    try:
        await repositories.update_custom_habit(user_email, habit_id, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.delete("/v1/habits/custom/{habit_id}")
async def delete_custom_habit(habit_id: str, user_email: str = Depends(require_user_email)):
    await repositories.delete_custom_habit(user_email, habit_id)
    return {"ok": True}


@router.get("/v1/habits/custom/done/{day}")
async def get_custom_done(day: date, user_email: str = Depends(require_user_email)):
    payload = await repositories.get_custom_habit_done(user_email, day.isoformat())
    return {"date": day.isoformat(), "done": payload}


@router.put("/v1/habits/custom/done/{day}")
async def set_custom_done(day: date, payload: CustomHabitDonePayload, user_email: str = Depends(require_user_email)):
    await repositories.set_custom_habit_done(user_email, day.isoformat(), payload.done)
    return {"ok": True}


@router.get("/v1/habits/custom/done")
async def list_custom_done_range(
    start: date = Query(...),
    end: date = Query(...),
    user_email: str = Depends(require_user_email),
):
    items = await repositories.list_custom_habit_done_range(user_email, start.isoformat(), end.isoformat())
    return {"items": items}
