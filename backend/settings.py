from __future__ import annotations

import os
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(..., alias="DATABASE_URL")
    google_token_encryption_key: str = Field(..., alias="GOOGLE_TOKEN_ENCRYPTION_KEY")
    backend_session_secret: str = Field(..., alias="BACKEND_SESSION_SECRET")

    calendar_timezone: str = Field("America/Sao_Paulo", alias="CALENDAR_TIMEZONE")

    allowed_emails_raw: str = Field("", alias="ALLOWED_EMAILS")
    jahdy_allowed_calendars_raw: str = Field("", alias="JAHDY_GOOGLE_ALLOWED_CALENDAR_IDS")
    guilherme_allowed_calendars_raw: str = Field("", alias="GUILHERME_GOOGLE_ALLOWED_CALENDAR_IDS")

    calendar_client_id: str | None = Field(None, alias="CALENDAR_CLIENT_ID")
    calendar_client_secret: str | None = Field(None, alias="CALENDAR_CLIENT_SECRET")
    calendar_redirect_uri: str | None = Field(None, alias="CALENDAR_REDIRECT_URI")

    redis_url: str | None = Field(None, alias="REDIS_URL")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_emails(self) -> List[str]:
        return [email.strip().lower() for email in self.allowed_emails_raw.split(",") if email.strip()]

    def allowed_calendar_ids(self, user_email: str) -> list[str]:
        if user_email.lower().startswith("jahdy"):
            raw = self.jahdy_allowed_calendars_raw
        elif user_email.lower().startswith("guilherme"):
            raw = self.guilherme_allowed_calendars_raw
        else:
            raw = ""
        items = [item.strip() for item in str(raw).split(",") if item.strip()]
        dedup = []
        seen = set()
        for item in items:
            if item in seen:
                continue
            seen.add(item)
            dedup.append(item)
        return dedup


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# For local dev convenience only.
if os.getenv("BACKEND_DEBUG_SETTINGS"):
    print(get_settings())
