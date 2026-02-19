from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import require_user_email
from backend.schemas import TaskCreate, TaskPatch, TaskSchedule, SubtaskCreate, SubtaskPatch
from backend import repositories

router = APIRouter()


@router.get("/v1/tasks")
async def list_tasks(
    start: date = Query(...),
    end: date = Query(...),
    user_email: str = Depends(require_user_email),
):
    items = await repositories.list_tasks(user_email, start.isoformat(), end.isoformat())
    task_ids = [item["id"] for item in items]
    subtasks = await repositories.list_subtasks(task_ids, user_email=user_email)
    return {"items": items, "subtasks": subtasks}


@router.get("/v1/tasks/unscheduled")
async def list_unscheduled_tasks(user_email: str = Depends(require_user_email)):
    items = await repositories.list_unscheduled_tasks(user_email, source="remembered")
    return {"items": items}


@router.post("/v1/tasks")
async def create_task(payload: TaskCreate, user_email: str = Depends(require_user_email)):
    record = await repositories.create_task(
        user_email,
        {
            "title": payload.title,
            "scheduled_date": payload.scheduled_date.isoformat() if payload.scheduled_date else None,
            "scheduled_time": payload.scheduled_time,
            "priority_tag": payload.priority_tag,
            "estimated_minutes": payload.estimated_minutes,
            "source": payload.source,
        },
    )
    await repositories.enqueue_outbox(user_email, "task", record["id"], "create", record)
    return record


@router.patch("/v1/tasks/{task_id}")
async def patch_task(task_id: str, payload: TaskPatch, user_email: str = Depends(require_user_email)):
    record = await repositories.update_task(user_email, task_id, payload.model_dump(exclude_unset=True))
    await repositories.enqueue_outbox(user_email, "task", task_id, "update", payload.model_dump(exclude_unset=True))
    return record


@router.patch("/v1/tasks/{task_id}/schedule")
async def schedule_task(task_id: str, payload: TaskSchedule, user_email: str = Depends(require_user_email)):
    record = await repositories.update_task(user_email, task_id, payload.model_dump(exclude_unset=True))
    await repositories.enqueue_outbox(user_email, "task", task_id, "update", payload.model_dump(exclude_unset=True))
    return record


@router.delete("/v1/tasks/{task_id}")
async def delete_task(task_id: str, user_email: str = Depends(require_user_email)):
    record = await repositories.get_task(user_email, task_id)
    await repositories.delete_task(user_email, task_id)
    await repositories.enqueue_outbox(
        user_email,
        "task",
        task_id,
        "delete",
        {
            "google_calendar_id": record.get("google_calendar_id"),
            "google_event_id": record.get("google_event_id"),
        },
    )
    return {"ok": True}


@router.post("/v1/subtasks")
async def add_subtask(payload: SubtaskCreate, user_email: str = Depends(require_user_email)):
    record = await repositories.add_subtask(
        user_email,
        payload.task_id,
        payload.title,
        payload.priority_tag,
        payload.estimated_minutes or 15,
    )
    return record


@router.patch("/v1/subtasks/{subtask_id}")
async def patch_subtask(subtask_id: str, payload: SubtaskPatch, user_email: str = Depends(require_user_email)):
    await repositories.update_subtask(user_email, subtask_id, payload.model_dump(exclude_unset=True))
    return {"ok": True}


@router.delete("/v1/subtasks/{subtask_id}")
async def delete_subtask(subtask_id: str, user_email: str = Depends(require_user_email)):
    await repositories.delete_subtask(user_email, subtask_id)
    return {"ok": True}
