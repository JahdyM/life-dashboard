from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import require_user_email
from backend import repositories
from backend.schemas import CustomHabitCreate

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
