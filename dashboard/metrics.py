from __future__ import annotations

from datetime import timedelta

from dashboard.constants import (
    HABITS,
    FIXED_COUPLE_HABIT_KEYS,
    MEETING_HABIT_KEYS,
    FAMILY_WORSHIP_HABIT_KEYS,
)


def compute_balance_score(row):
    habits_percent = row.get("habits_percent", 0) or 0
    work_hours = row.get("work_hours", 0) or 0
    sleep_hours = row.get("sleep_hours", 0) or 0
    boredom = row.get("boredom_minutes", 60) or 60

    work_score = min(work_hours, 8) / 8 * 100
    sleep_score = min(sleep_hours, 8) / 8 * 100
    if 10 <= boredom <= 40:
        boredom_score = 100
    elif boredom < 10:
        boredom_score = max(0, (boredom / 10) * 100)
    else:
        boredom_score = max(0, ((60 - boredom) / 20) * 100)

    score = (
        habits_percent * 0.35
        + work_score * 0.25
        + sleep_score * 0.25
        + boredom_score * 0.15
    )
    return round(score, 1)


def zero_boredom_streak(data, today):
    if data.empty:
        return 0
    boredom_map = {row["date"]: int(row.get("boredom_minutes", 0)) for _, row in data.iterrows()}
    count = 0
    current = today
    while True:
        if current not in boredom_map:
            break
        if boredom_map[current] != 0:
            break
        count += 1
        current -= timedelta(days=1)
    return count


def compute_habits_metrics(row, meeting_days, family_worship_day, custom_done_by_date, custom_habit_ids):
    total = 0
    completed = 0
    weekday = row["date"].weekday()
    for key, _ in HABITS:
        if key not in FIXED_COUPLE_HABIT_KEYS:
            continue
        if key in MEETING_HABIT_KEYS and weekday not in meeting_days:
            continue
        if key in FAMILY_WORSHIP_HABIT_KEYS and weekday != family_worship_day:
            continue
        total += 1
        completed += int(row.get(key, 0) or 0)

    done_map = custom_done_by_date.get(row["date"], {})
    for habit_id in custom_habit_ids:
        total += 1
        completed += int(bool(done_map.get(habit_id, 0)))

    priority_label = (row.get("priority_label") or "").strip()
    if priority_label:
        total += 1
        completed += int(row.get("priority_done", 0) or 0)
    percent = round((completed / total) * 100, 1) if total > 0 else 0
    return completed, percent, total
