import { prisma } from "../db/prisma";
import { decryptToken } from "../encryption";
import { DEFAULT_TIME_ZONE } from "../constants";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
const refreshLocks = new Map<string, Promise<string>>();

function isGoogleAuthExpired(status: number, bodyText: string) {
  if (status === 401 || status === 403) return true;
  return /invalid_grant|invalid_credentials|autherror/i.test(bodyText);
}

async function clearGoogleToken(userEmail: string) {
  await prisma.googleCalendarToken
    .delete({ where: { userEmail } })
    .catch(() => null);
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    if (isGoogleAuthExpired(response.status, text)) {
      throw new Error("GOOGLE_REAUTH_REQUIRED");
    }
    throw new Error("Failed to refresh Google token");
  }
  const payload = await response.json();
  return {
    access_token: payload.access_token as string,
    expires_in: payload.expires_in as number,
  };
}

async function getAccessToken(userEmail: string) {
  const tokenRow = await prisma.googleCalendarToken.findUnique({
    where: { userEmail },
  });
  if (!tokenRow) {
    throw new Error("Google calendar not connected");
  }
  const now = Date.now();
  const expiresAt = tokenRow.expiresAt ? Date.parse(tokenRow.expiresAt) : 0;
  if (tokenRow.accessToken && expiresAt - now > 60_000) {
    return tokenRow.accessToken;
  }

  const existingLock = refreshLocks.get(userEmail);
  if (existingLock) {
    return existingLock;
  }

  const refreshPromise = (async () => {
    let refreshToken: string;
    try {
      refreshToken = decryptToken(tokenRow.refreshTokenEnc);
    } catch (_error) {
      await clearGoogleToken(userEmail);
      throw new Error("Google calendar token is invalid. Reconnect your account.");
    }

    try {
      const refreshed = await refreshAccessToken(refreshToken);
      const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await prisma.googleCalendarToken.update({
        where: { userEmail },
        data: {
          accessToken: refreshed.access_token,
          expiresAt: newExpires,
          updatedAt: new Date().toISOString(),
        },
      });
      return refreshed.access_token;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "GOOGLE_REAUTH_REQUIRED"
      ) {
        await clearGoogleToken(userEmail);
        throw new Error("Google authorization expired. Please reconnect calendar.");
      }
      throw error;
    } finally {
      refreshLocks.delete(userEmail);
    }
  })();

  refreshLocks.set(userEmail, refreshPromise);
  return refreshPromise;
}

export async function listGoogleEvents(
  userEmail: string,
  startIso: string,
  endIso: string,
  calendarId = "primary"
) {
  const accessToken = await getAccessToken(userEmail);
  const timeMin = `${startIso}T00:00:00Z`;
  const timeMax = `${endIso}T23:59:59Z`;
  const items: any[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text();
      if (isGoogleAuthExpired(response.status, text)) {
        await clearGoogleToken(userEmail);
        throw new Error("Google authorization expired. Please reconnect calendar.");
      }
      throw new Error(text || "Google events fetch failed");
    }
    const payload = await response.json();
    items.push(...(payload.items || []));
    pageToken = payload.nextPageToken || null;
  } while (pageToken);

  return items;
}

export function googleEventToTask(event: any, timeZone: string) {
  const start = event.start || {};
  const end = event.end || {};
  if (start.date) {
    return {
      title: event.summary || "(no title)",
      scheduled_date: start.date,
      scheduled_time: null,
      is_all_day: true,
    };
  }
  const dateTime = start.dateTime as string | undefined;
  if (!dateTime) {
    return {
      title: event.summary || "(no title)",
      scheduled_date: null,
      scheduled_time: null,
      is_all_day: true,
    };
  }
  const date = new Date(dateTime);
  const dateStr = formatInTimeZone(date, timeZone, "yyyy-MM-dd");
  const timeStr = formatInTimeZone(date, timeZone, "HH:mm");
  return {
    title: event.summary || "(no title)",
    scheduled_date: dateStr,
    scheduled_time: timeStr,
    is_all_day: false,
  };
}

export async function createGoogleEvent(
  userEmail: string,
  calendarId: string,
  payload: {
    title: string;
    scheduledDate: string;
    scheduledTime?: string | null;
    estimatedMinutes?: number | null;
    timeZone?: string;
  }
) {
  const accessToken = await getAccessToken(userEmail);
  const timeZone = payload.timeZone || DEFAULT_TIME_ZONE;
  const event: any = {
    summary: payload.title,
  };
  if (payload.scheduledTime) {
    const startLocal = `${payload.scheduledDate} ${payload.scheduledTime}`;
    const startUtc = fromZonedTime(startLocal, timeZone);
    const endUtc = payload.estimatedMinutes
      ? new Date(startUtc.getTime() + payload.estimatedMinutes * 60000)
      : new Date(startUtc.getTime() + 30 * 60000);
    event.start = {
      dateTime: startUtc.toISOString(),
      timeZone,
    };
    event.end = {
      dateTime: endUtc.toISOString(),
      timeZone,
    };
  } else {
    event.start = { date: payload.scheduledDate };
    event.end = { date: payload.scheduledDate };
  }
  const response = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    if (isGoogleAuthExpired(response.status, text)) {
      await clearGoogleToken(userEmail);
      throw new Error("Google authorization expired. Please reconnect calendar.");
    }
    throw new Error(text || "Google event create failed");
  }
  return response.json();
}

export async function updateGoogleEvent(
  userEmail: string,
  calendarId: string,
  eventId: string,
  payload: {
    title?: string;
    scheduledDate?: string;
    scheduledTime?: string | null;
    estimatedMinutes?: number | null;
    timeZone?: string;
  }
) {
  const accessToken = await getAccessToken(userEmail);
  const timeZone = payload.timeZone || DEFAULT_TIME_ZONE;
  const event: any = {};
  if (payload.title) event.summary = payload.title;
  if (payload.scheduledDate) {
    if (payload.scheduledTime) {
      const startLocal = `${payload.scheduledDate} ${payload.scheduledTime}`;
      const startUtc = fromZonedTime(startLocal, timeZone);
      const endUtc = payload.estimatedMinutes
        ? new Date(startUtc.getTime() + payload.estimatedMinutes * 60000)
        : new Date(startUtc.getTime() + 30 * 60000);
      event.start = { dateTime: startUtc.toISOString(), timeZone };
      event.end = { dateTime: endUtc.toISOString(), timeZone };
    } else {
      event.start = { date: payload.scheduledDate };
      event.end = { date: payload.scheduledDate };
    }
  }
  const response = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    if (isGoogleAuthExpired(response.status, text)) {
      await clearGoogleToken(userEmail);
      throw new Error("Google authorization expired. Please reconnect calendar.");
    }
    throw new Error(text || "Google event update failed");
  }
  return response.json();
}

export async function deleteGoogleEvent(
  userEmail: string,
  calendarId: string,
  eventId: string
) {
  const accessToken = await getAccessToken(userEmail);
  const response = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) {
    const text = await response.text();
    if (isGoogleAuthExpired(response.status, text)) {
      await clearGoogleToken(userEmail);
      throw new Error("Google authorization expired. Please reconnect calendar.");
    }
    throw new Error(text || "Google event delete failed");
  }
  return true;
}
