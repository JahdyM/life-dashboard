from __future__ import annotations

import html
import calendar as _calendar
from datetime import date, datetime, timedelta

from dashboard.constants import DAY_LABELS, MOODS, MOOD_COLORS, MOOD_TO_INT
from dashboard.theme import get_active_theme


def _active_theme():
    return get_active_theme()[1]


def month_last_day(reference_date):
    days = _calendar.monthrange(reference_date.year, reference_date.month)[1]
    return reference_date.replace(day=days)


def apply_common_plot_style(fig, title, show_xgrid=True, show_ygrid=True):
    theme = _active_theme()
    fig.update_layout(
        title=title,
        title_font=dict(color=theme["text_main"], size=16, family="Crimson Text"),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=theme["text_main"], family="IBM Plex Sans"),
        margin=dict(l=40, r=20, t=40, b=30),
        xaxis=dict(
            showgrid=show_xgrid,
            gridcolor=theme["plot_grid"],
            tickfont=dict(color=theme["text_soft"]),
            zeroline=False,
            showline=True,
            linecolor=theme["border"],
            mirror=True,
        ),
        yaxis=dict(
            showgrid=show_ygrid,
            gridcolor=theme["plot_grid"],
            zeroline=False,
            tickfont=dict(color=theme["text_soft"]),
            showline=True,
            linecolor=theme["border"],
            mirror=True,
        ),
    )
    return fig


def build_month_tracker_grid(year, month, mood_map):
    import numpy as np

    days_in_month = _calendar.monthrange(year, month)[1]
    z = np.full((31, 1), np.nan)
    text = [["" for _ in range(1)] for _ in range(31)]
    for day in range(1, days_in_month + 1):
        current = date(year, month, day)
        mood = mood_map.get(current)
        row = day - 1
        if mood:
            z[row, 0] = MOOD_TO_INT.get(mood, np.nan)
            text[row][0] = f"{current.isoformat()} • {mood}"
        else:
            text[row][0] = f"{current.isoformat()} • No entry"
    month_label = date(year, month, 1).strftime("%b")
    return z, text, [month_label], list(range(1, 32))


def build_year_tracker_grid(year, mood_map):
    import numpy as np

    z = np.full((31, 12), np.nan)
    text = [["" for _ in range(12)] for _ in range(31)]
    for month in range(1, 13):
        days_in_month = _calendar.monthrange(year, month)[1]
        for day in range(1, days_in_month + 1):
            current = date(year, month, day)
            mood = mood_map.get(current)
            row = day - 1
            col = month - 1
            if mood:
                z[row, col] = MOOD_TO_INT.get(mood, np.nan)
                text[row][col] = f"{current.isoformat()} • {mood}"
            else:
                text[row][col] = f"{current.isoformat()} • No entry"
    month_labels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]
    return z, text, month_labels, list(range(1, 32))


def mood_heatmap(z, hover_text, x_labels, y_labels, title=""):
    import plotly.graph_objects as go

    colorscale = []
    n = len(MOODS)
    for i, mood in enumerate(MOODS):
        color = MOOD_COLORS[mood]
        start = i / n
        end = (i + 1) / n
        colorscale.append((start, color))
        colorscale.append((end - 1e-6, color))

    fig = go.Figure(
        data=go.Heatmap(
            z=z,
            text=hover_text,
            hoverinfo="text",
            colorscale=colorscale,
            showscale=False,
            zmin=0,
            zmax=len(MOODS) - 1,
            xgap=2,
            ygap=2,
        )
    )

    theme = _active_theme()
    fig.update_layout(
        title=title,
        title_font=dict(color=theme["text_main"], size=16, family="Crimson Text"),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=theme["text_main"], family="IBM Plex Sans"),
        margin=dict(l=20, r=20, t=40, b=20),
        xaxis=dict(
            showgrid=False,
            zeroline=False,
            tickfont=dict(color=theme["text_soft"], size=11),
            tickmode="array",
            tickvals=list(range(len(x_labels))),
            ticktext=x_labels,
            side="top",
            showline=True,
            linecolor=theme["border"],
            mirror=True,
        ),
        yaxis=dict(
            showgrid=False,
            zeroline=False,
            tickmode="array",
            tickvals=list(range(len(y_labels))),
            ticktext=y_labels,
            autorange="reversed",
            tickfont=dict(color=theme["text_soft"], size=10),
            showline=True,
            linecolor=theme["border"],
            mirror=True,
        ),
    )

    return fig


def dot_chart(values, dates, title, color, height=260):
    import plotly.graph_objects as go

    fig = go.Figure(
        data=go.Scatter(
            x=values,
            y=dates,
            mode="lines+markers",
            line=dict(color=color, width=2),
            marker=dict(size=8, color=color, line=dict(width=1, color=_active_theme()["plot_marker_line"])),
        )
    )
    apply_common_plot_style(fig, title, show_xgrid=True, show_ygrid=True)
    fig.update_layout(height=height)
    fig.update_yaxes(categoryorder="array", categoryarray=list(dates), automargin=True)
    fig.update_xaxes(tickfont=dict(size=10, color=_active_theme()["text_soft"]))
    return fig


def build_badge_popover(label, count, css_kind, details_text):
    lines = [line.strip() for line in str(details_text or "").split("\n") if line.strip()]
    if not lines:
        lines = [f"{label} {count}"]
    heading = "Google events" if css_kind == "google" else "Tasks"
    items_html = "".join([f"<li>{html.escape(line)}</li>" for line in lines])
    return (
        f"<span class='cal-popover cal-popover-{css_kind}'>"
        f"<span class='cal-badge cal-{css_kind}'>{label} {count}</span>"
        f"<div class='cal-popover-panel'>"
        f"<div class='cal-popover-title'>{heading}</div>"
        f"<ul>{items_html}</ul>"
        "</div>"
        "</span>"
    )


def build_week_calendar_html(
    week_start,
    selected_date,
    google_counts,
    task_counts,
    google_details,
    task_details,
    score_map,
):
    days = [week_start + timedelta(days=offset) for offset in range(7)]
    today_date = date.today()
    header_cells = "".join(
        [
            (
                f"<th>{DAY_LABELS[idx]}<br>"
                f"<span style='font-size:10px;color:#9f95ad;'>{day.strftime('%d/%m')}</span></th>"
            )
            for idx, day in enumerate(days)
        ]
    )
    cells = []
    for day in days:
        google_count = google_counts.get(day, 0)
        task_count = task_counts.get(day, 0)
        classes = ["calendar-cell"]
        if day == selected_date:
            classes.append("selected")
        if day == today_date:
            classes.append("today")
        badges = []
        if google_count:
            badges.append(
                build_badge_popover("G", google_count, "google", google_details.get(day, ""))
            )
        if task_count:
            badges.append(
                build_badge_popover("T", task_count, "task", task_details.get(day, ""))
            )
        if not badges:
            badges.append("<span class='cal-badge cal-none'>-</span>")
        day_score = score_map.get(day)
        if day_score is None:
            score_html = "<div class='calendar-score empty'>Score -</div>"
        else:
            score_html = f"<div class='calendar-score'>Score {int(round(day_score))}</div>"
        cells.append(
            (
                f"<td class='{' '.join(classes)}'>"
                f"<div class='calendar-day'>{day.day}</div>"
                f"<div class='calendar-badges'>{''.join(badges)}</div>"
                f"{score_html}"
                "</td>"
            )
        )
    return (
        "<div class='calendar-month'>"
        "<table class='calendar-table'>"
        f"<thead><tr>{header_cells}</tr></thead>"
        f"<tbody><tr>{''.join(cells)}</tr></tbody>"
        "</table>"
        "</div>"
    )


def build_hourly_schedule_rows(items):
    all_day = [item["title"] for item in items if item.get("time") is None]
    rows = []
    if all_day:
        rows.append({"Hour": "All day", "Scheduled": " | ".join(all_day)})
    for hour in range(6, 23):
        hour_key = f"{hour:02d}:00"
        bucket = []
        for item in items:
            item_time = item.get("time")
            if not item_time:
                continue
            if item_time[:2] == f"{hour:02d}":
                bucket.append(item["title"])
        rows.append({"Hour": hour_key, "Scheduled": " | ".join(bucket) if bucket else ""})
    return rows
