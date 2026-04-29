"""Weekly couple dashboard email report."""
from __future__ import annotations

import smtplib
import ssl
from datetime import date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import streamlit as st


def _secret(path: list, default=""):
    current = st.secrets
    try:
        for key in path:
            if key not in current:
                return default
            current = current[key]
        return str(current).strip() if current is not None else default
    except Exception:
        return default


def smtp_configured() -> bool:
    return bool(_secret(["email", "smtp_host"]) and _secret(["email", "smtp_user"]) and _secret(["email", "smtp_password"]))


def build_weekly_report_html(
    current_name: str,
    partner_name: str,
    data,
    custom_done_by_date: dict,
    custom_habit_ids: list,
    meeting_days: list,
    family_worship_day: int,
    sync_score_pct: int = 0,
) -> str:
    from dashboard.metrics import compute_habits_metrics, compute_balance_score
    from dashboard.constants import MOODS, MOOD_COLORS

    today = date.today()
    week_start = today - timedelta(days=6)

    if data is None or getattr(data, "empty", True):
        week_data = None
    else:
        week_data = data[(data["date"] >= week_start) & (data["date"] <= today)].copy()

    def _fmt(val, suffix="", decimals=1):
        if val is None:
            return "–"
        try:
            return f"{round(float(val), decimals)}{suffix}"
        except Exception:
            return str(val)

    rows_html = ""
    mood_freq: dict[str, int] = {}
    avg_sleep = avg_anxiety = avg_work = habits_pct_list = None

    if week_data is not None and not week_data.empty:
        avg_sleep = week_data["sleep_hours"].mean() if not week_data["sleep_hours"].isna().all() else None
        avg_anxiety = week_data["anxiety_level"].mean() if not week_data["anxiety_level"].isna().all() else None
        avg_work = week_data["work_hours"].mean() if not week_data["work_hours"].isna().all() else None
        for _, row in week_data.iterrows():
            mood = row.get("mood_category")
            if mood:
                mood_freq[mood] = mood_freq.get(mood, 0) + 1
            _, pct, _ = compute_habits_metrics(
                row, meeting_days, family_worship_day, custom_done_by_date, custom_habit_ids
            )
            date_str = row["date"].strftime("%d/%m") if hasattr(row["date"], "strftime") else str(row["date"])
            mood_color = MOOD_COLORS.get(mood, "#888") if mood else "#888"
            rows_html += f"""
            <tr>
              <td style="padding:4px 10px;">{date_str}</td>
              <td style="padding:4px 10px; color:{mood_color};">{mood or "–"}</td>
              <td style="padding:4px 10px;">{_fmt(row.get('sleep_hours'))}h</td>
              <td style="padding:4px 10px;">{_fmt(row.get('work_hours'))}h</td>
              <td style="padding:4px 10px;">{int(round(pct))}%</td>
            </tr>"""

    top_mood = max(mood_freq, key=mood_freq.get) if mood_freq else "–"
    top_mood_color = MOOD_COLORS.get(top_mood, "#888")

    sync_bar_color = "#8e79af" if sync_score_pct >= 80 else "#D9C979" if sync_score_pct >= 50 else "#D95252"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0e0b14;font-family:'Segoe UI',Arial,sans-serif;color:#f0eaf8;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:600;color:#e2d6f5;margin-bottom:4px;">
    📅 Relatório Semanal
  </h1>
  <p style="font-size:13px;color:#a89cb8;margin-top:0;">{week_start.strftime('%d/%m')} – {today.strftime('%d/%m/%Y')} &nbsp;·&nbsp; {current_name} &amp; {partner_name}</p>

  <div style="background:#1e1a2b;border:1px solid #5b4f70;border-radius:12px;padding:16px;margin:16px 0;">
    <div style="font-size:12px;color:#a89cb8;margin-bottom:8px;">SYNC SCORE DA SEMANA</div>
    <div style="background:#2a2338;border-radius:999px;height:8px;overflow:hidden;margin-bottom:6px;">
      <div style="background:{sync_bar_color};width:{sync_score_pct}%;height:8px;border-radius:999px;"></div>
    </div>
    <div style="font-size:20px;font-weight:700;color:#e2d6f5;">{sync_score_pct}%</div>
  </div>

  <div style="display:flex;gap:12px;margin:12px 0;flex-wrap:wrap;">
    <div style="flex:1;min-width:120px;background:#1e1a2b;border:1px solid #5b4f70;border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#a89cb8;">Sono médio</div>
      <div style="font-size:18px;font-weight:600;color:#e2d6f5;">{_fmt(avg_sleep)}h</div>
    </div>
    <div style="flex:1;min-width:120px;background:#1e1a2b;border:1px solid #5b4f70;border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#a89cb8;">Ansiedade média</div>
      <div style="font-size:18px;font-weight:600;color:#e2d6f5;">{_fmt(avg_anxiety)}/10</div>
    </div>
    <div style="flex:1;min-width:120px;background:#1e1a2b;border:1px solid #5b4f70;border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#a89cb8;">Trabalho médio</div>
      <div style="font-size:18px;font-weight:600;color:#e2d6f5;">{_fmt(avg_work)}h</div>
    </div>
    <div style="flex:1;min-width:120px;background:#1e1a2b;border:1px solid #5b4f70;border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#a89cb8;">Humor mais frequente</div>
      <div style="font-size:16px;font-weight:600;color:{top_mood_color};">{top_mood}</div>
    </div>
  </div>

  <div style="background:#1e1a2b;border:1px solid #5b4f70;border-radius:12px;overflow:hidden;margin:12px 0;">
    <div style="padding:10px 12px;font-size:12px;color:#a89cb8;border-bottom:1px solid #3a3050;">DIA A DIA</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="color:#a89cb8;font-size:11px;">
          <th style="padding:4px 10px;text-align:left;">Dia</th>
          <th style="padding:4px 10px;text-align:left;">Humor</th>
          <th style="padding:4px 10px;text-align:left;">Sono</th>
          <th style="padding:4px 10px;text-align:left;">Trabalho</th>
          <th style="padding:4px 10px;text-align:left;">Hábitos</th>
        </tr>
      </thead>
      <tbody>{rows_html or '<tr><td colspan="5" style="padding:12px;color:#7a6e8a;text-align:center;">Sem dados esta semana</td></tr>'}</tbody>
    </table>
  </div>

  <p style="font-size:11px;color:#5b4f70;text-align:center;margin-top:20px;">
    Enviado pelo Personal Life Dashboard ❤️
  </p>
</div>
</body>
</html>"""
    return html


def send_weekly_report(to_emails: list[str], html_body: str, subject: str = "") -> tuple[bool, str]:
    host = _secret(["email", "smtp_host"])
    port = int(_secret(["email", "smtp_port"], "587"))
    user = _secret(["email", "smtp_user"])
    password = _secret(["email", "smtp_password"])
    from_email = _secret(["email", "smtp_from"], user)

    if not subject:
        subject = f"📅 Relatório Semanal do Dashboard — {date.today().strftime('%d/%m/%Y')}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = ", ".join(to_emails)
    msg.attach(MIMEText(html_body, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(user, password)
            server.sendmail(from_email, to_emails, msg.as_string())
        return True, ""
    except Exception as exc:
        return False, str(exc)
