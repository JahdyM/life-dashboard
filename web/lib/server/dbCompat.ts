import { prisma } from "../db/prisma";
import { logServerEvent } from "./logger";

const globalForCompat = globalThis as unknown as {
  taskColumnsEnsurePromise?: Promise<void>;
  taskColumnsEnsured?: boolean;
  ministryTablesEnsurePromise?: Promise<void>;
  ministryTablesEnsured?: boolean;
  moodTablesEnsurePromise?: Promise<void>;
  moodTablesEnsured?: boolean;
};

async function applyTaskCompletionColumnsMigration() {
  await prisma.$executeRawUnsafe(
    "ALTER TABLE todo_tasks ADD COLUMN IF NOT EXISTS completed_at TEXT"
  );
  await prisma.$executeRawUnsafe(
    "ALTER TABLE todo_subtasks ADD COLUMN IF NOT EXISTS completed_at TEXT"
  );
}

export async function ensureTaskCompletionColumns() {
  if (globalForCompat.taskColumnsEnsured) {
    return;
  }

  if (!globalForCompat.taskColumnsEnsurePromise) {
    globalForCompat.taskColumnsEnsurePromise = (async () => {
      await applyTaskCompletionColumnsMigration();
      globalForCompat.taskColumnsEnsured = true;
      logServerEvent("info", {
        endpoint: "db-compat",
        message: "Ensured completed_at columns for task tables",
      });
    })().catch((error) => {
      globalForCompat.taskColumnsEnsurePromise = undefined;
      logServerEvent("error", {
        endpoint: "db-compat",
        message: "Failed to ensure completed_at compatibility columns",
        error,
      });
      throw error;
    });
  }

  await globalForCompat.taskColumnsEnsurePromise;
}

async function applyMinistryTablesMigration() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS monthly_goals (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      target_minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    "CREATE UNIQUE INDEX IF NOT EXISTS monthly_goals_user_email_year_month_key ON monthly_goals(user_email, year, month)"
  );
  await prisma.$executeRawUnsafe(
    "CREATE INDEX IF NOT EXISTS monthly_goals_user_email_year_month_idx ON monthly_goals(user_email, year, month)"
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS daily_service_entries (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      date TEXT NOT NULL,
      goal_minutes INTEGER,
      actual_minutes INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    "CREATE UNIQUE INDEX IF NOT EXISTS daily_service_entries_user_email_date_key ON daily_service_entries(user_email, date)"
  );
  await prisma.$executeRawUnsafe(
    "CREATE INDEX IF NOT EXISTS daily_service_entries_user_email_date_idx ON daily_service_entries(user_email, date)"
  );
}

export async function ensureMinistryTables() {
  if (globalForCompat.ministryTablesEnsured) {
    return;
  }

  if (!globalForCompat.ministryTablesEnsurePromise) {
    globalForCompat.ministryTablesEnsurePromise = (async () => {
      await applyMinistryTablesMigration();
      globalForCompat.ministryTablesEnsured = true;
      logServerEvent("info", {
        endpoint: "db-compat",
        message: "Ensured ministry hours tables",
      });
    })().catch((error) => {
      globalForCompat.ministryTablesEnsurePromise = undefined;
      logServerEvent("error", {
        endpoint: "db-compat",
        message: "Failed to ensure ministry hours tables",
        error,
      });
      throw error;
    });
  }

  await globalForCompat.ministryTablesEnsurePromise;
}

async function applyMoodMomentTablesMigration() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mood_moment_entries (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      day_iso TEXT NOT NULL,
      logged_at TEXT NOT NULL,
      mood_category TEXT NOT NULL,
      mood_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    "CREATE INDEX IF NOT EXISTS mood_moment_entries_user_day_logged_idx ON mood_moment_entries(user_email, day_iso, logged_at)"
  );
  await prisma.$executeRawUnsafe(
    "CREATE INDEX IF NOT EXISTS mood_moment_entries_user_logged_idx ON mood_moment_entries(user_email, logged_at)"
  );
}

export async function ensureMoodMomentTables() {
  if (globalForCompat.moodTablesEnsured) {
    return;
  }

  if (!globalForCompat.moodTablesEnsurePromise) {
    globalForCompat.moodTablesEnsurePromise = (async () => {
      await applyMoodMomentTablesMigration();
      globalForCompat.moodTablesEnsured = true;
      logServerEvent("info", {
        endpoint: "db-compat",
        message: "Ensured mood moment tables",
      });
    })().catch((error) => {
      globalForCompat.moodTablesEnsurePromise = undefined;
      logServerEvent("error", {
        endpoint: "db-compat",
        message: "Failed to ensure mood moment tables",
        error,
      });
      throw error;
    });
  }

  await globalForCompat.moodTablesEnsurePromise;
}
