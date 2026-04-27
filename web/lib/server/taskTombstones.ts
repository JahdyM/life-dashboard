import { prisma } from "@/lib/db/prisma";

type GoogleTaskIdentity = {
  externalEventKey?: string | null;
  googleCalendarId?: string | null;
  googleEventId?: string | null;
};

function normalizeUserEmail(userEmail: string) {
  return userEmail.trim().toLowerCase();
}

export function resolveGoogleTaskKey(task: GoogleTaskIdentity) {
  if (task.externalEventKey?.startsWith("google:")) return task.externalEventKey;
  if (task.googleEventId) {
    return `google:${task.googleCalendarId || "primary"}:${task.googleEventId}`;
  }
  return null;
}

export function deletedGoogleTaskSettingKey(userEmail: string, googleTaskKey: string) {
  return `${normalizeUserEmail(userEmail)}::deleted_google_task::${googleTaskKey}`;
}

export async function rememberDeletedGoogleTask(
  userEmail: string,
  task: GoogleTaskIdentity
) {
  const googleTaskKey = resolveGoogleTaskKey(task);
  if (!googleTaskKey) return;

  await prisma.setting.upsert({
    where: { key: deletedGoogleTaskSettingKey(userEmail, googleTaskKey) },
    create: {
      key: deletedGoogleTaskSettingKey(userEmail, googleTaskKey),
      value: new Date().toISOString(),
    },
    update: {
      value: new Date().toISOString(),
    },
  });
}

export async function getDeletedGoogleTaskKeySet(
  userEmail: string,
  googleTaskKeys: string[]
) {
  if (!googleTaskKeys.length) return new Set<string>();
  const normalized = Array.from(new Set(googleTaskKeys));
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: normalized.map((key) => deletedGoogleTaskSettingKey(userEmail, key)),
      },
    },
    select: { key: true },
  });

  const prefix = `${normalizeUserEmail(userEmail)}::deleted_google_task::`;
  return new Set(
    rows
      .map((row) => row.key.startsWith(prefix) ? row.key.slice(prefix.length) : null)
      .filter((key): key is string => Boolean(key))
  );
}
