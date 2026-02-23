import { prisma } from "../db/prisma";
import { logServerEvent } from "./logger";

const globalForCompat = globalThis as unknown as {
  taskColumnsEnsurePromise?: Promise<void>;
  taskColumnsEnsured?: boolean;
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
