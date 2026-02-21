from __future__ import annotations

from datetime import date, time
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field


class DayEntryPatch(BaseModel):
    sleep_hours: Optional[float] = None
    anxiety_level: Optional[int] = None
    work_hours: Optional[float] = None
    boredom_minutes: Optional[int] = None
    mood_category: Optional[str] = None
    priority_label: Optional[str] = None
    priority_done: Optional[bool] = None

    bible_reading: Optional[bool] = None
    bible_study: Optional[bool] = None
    dissertation_work: Optional[bool] = None
    workout: Optional[bool] = None
    general_reading: Optional[bool] = None
    shower: Optional[bool] = None
    meeting_attended: Optional[bool] = None
    prepare_meeting: Optional[bool] = None
    writing: Optional[bool] = None
    scientific_writing: Optional[bool] = None
    daily_text: Optional[bool] = None
    family_worship: Optional[bool] = None


class DayEntryResponse(BaseModel):
    date: str
    user_email: str
    data: Dict[str, Any]


class CustomHabit(BaseModel):
    id: str
    name: str
    active: bool = True


class CustomHabitCreate(BaseModel):
    name: str


class CustomHabitDonePayload(BaseModel):
    done: Dict[str, int] = Field(default_factory=dict)


class TaskCreate(BaseModel):
    title: str
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[time] = None
    priority_tag: str = "Medium"
    estimated_minutes: Optional[int] = None
    source: str = "manual"


class TaskPatch(BaseModel):
    title: Optional[str] = None
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[time] = None
    priority_tag: Optional[str] = None
    estimated_minutes: Optional[int] = None
    actual_minutes: Optional[int] = None
    is_done: Optional[bool] = None


class TaskSchedule(BaseModel):
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[time] = None


class TaskResponse(BaseModel):
    id: str
    user_email: str
    title: str
    source: str
    scheduled_date: Optional[str]
    scheduled_time: Optional[str]
    priority_tag: str
    estimated_minutes: Optional[int]
    actual_minutes: Optional[int]
    is_done: int
    google_calendar_id: Optional[str] = None
    google_event_id: Optional[str] = None


class SubtaskCreate(BaseModel):
    task_id: str
    title: str
    priority_tag: str = "Medium"
    estimated_minutes: Optional[int] = 15


class SubtaskPatch(BaseModel):
    title: Optional[str] = None
    priority_tag: Optional[str] = None
    estimated_minutes: Optional[int] = None
    actual_minutes: Optional[int] = None
    is_done: Optional[bool] = None


class SubtaskResponse(BaseModel):
    id: str
    task_id: str
    user_email: str
    title: str
    priority_tag: str
    estimated_minutes: Optional[int]
    actual_minutes: Optional[int]
    is_done: int


class BootstrapResponse(BaseModel):
    user_email: str
    user_name: str
    allowed: bool
    today_snapshot: Dict[str, Any]
    quick_indicators: Dict[str, Any]


class SyncStatusResponse(BaseModel):
    connected: bool
    last_synced_at: Optional[str]
    last_error: Optional[str]


class CalendarWeekResponse(BaseModel):
    start_date: str
    days: List[Dict[str, Any]]


class CoupleMoodboardResponse(BaseModel):
    x_labels: List[str]
    y_labels: List[str]
    z: List[List[float]]
    hover_text: List[List[str]]
    warning: Optional[str] = None


class MeetingDaysPayload(BaseModel):
    days: List[int]


class FamilyWorshipPayload(BaseModel):
    day: int


class EntriesResponse(BaseModel):
    items: List[Dict[str, Any]]


class HeaderSnapshotResponse(BaseModel):
    today: str
    pending_tasks: int
    shared_snapshot: Dict[str, Any]
