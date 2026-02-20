from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder

from backend.auth import require_user_email
from backend.schemas import TaskCreate, TaskPatch, TaskSchedule, SubtaskCreate, SubtaskPatch
from backend import repositories

logger = logging.getLogger(__name__)

router = APIRouter()


def _normalize_task_patch(patch: dict) -> dict:
    clean = dict(patch or {})
    value = clean.get("scheduled_date")
    if value is not None and hasattr(value, "isoformat"):
        clean["scheduled_date"] = value.isoformat()
    value = clean.get("scheduled_time")
    if value is not None:
        if hasattr(value, "strftime"):
            clean["scheduled_time"] = value.strftime("%H:%M")
        else:
            value_str = str(value).strip()
            clean["scheduled_time"] = value_str[:5] if value_str else None
    return clean


@router.get("/v1/tasks")
async def list_tasks(
    start: date = Query(...),
    end: date = Query(...),
    user_email: str = Depends(require_user_email),
):
    items = await repositories.list_tasks(user_email, start.isoformat(), end.isoformat())
    task_ids = [item["id"] for item in items]
    subtasks = await repositories.list_subtasks(task_ids, user_email=user_email)
    return {"items": jsonable_encoder(items), "subtasks": jsonable_encoder(subtasks)}


@router.get("/v1/tasks/unscheduled")
async def list_unscheduled_tasks(user_email: str = Depends(require_user_email)):
    items = await repositories.list_unscheduled_tasks(user_email, source="remembered")
    return {"items": items}


@router.post("/v1/tasks")
async def create_task(payload: TaskCreate, user_email: str = Depends(require_user_email)):
    try:
        clean = _normalize_task_patch(payload.model_dump(exclude_unset=True))
        record = await repositories.create_task(
            user_email,
            {
                "title": clean.get("title") or payload.title,
                "scheduled_date": clean.get("scheduled_date"),
                "scheduled_time": clean.get("scheduled_time"),
                "priority_tag": clean.get("priority_tag") or payload.priority_tag,
                "estimated_minutes": clean.get("estimated_minutes") or payload.estimated_minutes,
                "source": clean.get("source") or payload.source,
            },
        )
        await repositories.enqueue_outbox(user_email, "task", record["id"], "create", record)
        return jsonable_encoder(record)
    except Exception as exc:
        logger.exception("Failed to create task: %s", exc)
        raise HTTPException(status_code=500, detail="Internal error")


@router.patch("/v1/tasks/{task_id}")
async def patch_task(task_id: str, payload: TaskPatch, user_email: str = Depends(require_user_email)):
    try:
        patch = _normalize_task_patch(payload.model_dump(exclude_unset=True))
        record = await repositories.update_task(user_email, task_id, patch)
        await repositories.enqueue_outbox(user_email, "task", task_id, "update", patch)
        return jsonable_encoder(record)
    except Exception as exc:
        logger.exception("Failed to update task: %s", exc)
        raise HTTPException(status_code=500, detail="Internal error")


@router.patch("/v1/tasks/{task_id}/schedule")
async def schedule_task(task_id: str, payload: TaskSchedule, user_email: str = Depends(require_user_email)):
    try:
        patch = _normalize_task_patch(payload.model_dump(exclude_unset=True))
        record = await repositories.update_task(user_email, task_id, patch)
        await repositories.enqueue_outbox(user_email, "task", task_id, "update", patch)
        return jsonable_encoder(record)
    except Exception as exc:
        logger.exception("Failed to schedule task: %s", exc)
        raise HTTPException(status_code=500, detail="Internal error")


@router.delete("/v1/tasks/{task_id}")
async def delete_task(task_id: str, user_email: str = Depends(require_user_email)):
    try:
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
    except Exception as exc:
        logger.exception("Failed to delete task: %s", exc)
        raise HTTPException(status_code=500, detail="Internal error")


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
