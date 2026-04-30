import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getAllowedEmails } from "@/lib/env";

export function getCoupleKey(userEmail: string): string {
  const emails = getAllowedEmails();
  const partner = emails.find((e) => e !== userEmail.toLowerCase()) || "";
  const pair = [userEmail.toLowerCase(), partner].sort();
  return `couple::${pair.join("&&")}`;
}

export function getPartnerEmail(userEmail: string): string | null {
  const emails = getAllowedEmails();
  return emails.find((e) => e !== userEmail.toLowerCase()) || null;
}

async function getCoupleRaw(userEmail: string, subkey: string): Promise<string | null> {
  const key = `${getCoupleKey(userEmail)}::${subkey}`;
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setCoupleRaw(userEmail: string, subkey: string, value: string): Promise<void> {
  const key = `${getCoupleKey(userEmail)}::${subkey}`;
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// ---- Expenses ---------------------------------------------------------------

export type Expense = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  paidBy: string;
  createdAt: string;
};

function expenseKey(year: number, month: number) {
  return `expenses::${year}::${month}`;
}

export async function getExpenses(
  userEmail: string,
  year: number,
  month: number
): Promise<Expense[]> {
  const raw = await getCoupleRaw(userEmail, expenseKey(year, month));
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function saveExpenses(
  userEmail: string,
  year: number,
  month: number,
  items: Expense[]
): Promise<void> {
  await setCoupleRaw(userEmail, expenseKey(year, month), JSON.stringify(items));
}

export async function addExpense(
  userEmail: string,
  year: number,
  month: number,
  data: Omit<Expense, "id" | "createdAt">
): Promise<Expense> {
  const items = await getExpenses(userEmail, year, month);
  const record: Expense = {
    id: crypto.randomUUID().replace(/-/g, ""),
    createdAt: new Date().toISOString(),
    ...data,
  };
  items.push(record);
  await saveExpenses(userEmail, year, month, items);
  return record;
}

export async function removeExpense(
  userEmail: string,
  year: number,
  month: number,
  id: string
): Promise<void> {
  const items = await getExpenses(userEmail, year, month);
  await saveExpenses(
    userEmail,
    year,
    month,
    items.filter((e) => e.id !== id)
  );
}

// ---- Savings Goals ----------------------------------------------------------

export type SavingsGoal = {
  id: string;
  title: string;
  target: number;
  current: number;
  emoji: string;
  createdAt: string;
};

export async function getSavingsGoals(userEmail: string): Promise<SavingsGoal[]> {
  const raw = await getCoupleRaw(userEmail, "savings_goals");
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function saveSavingsGoals(userEmail: string, items: SavingsGoal[]): Promise<void> {
  await setCoupleRaw(userEmail, "savings_goals", JSON.stringify(items));
}

export async function addSavingsGoal(
  userEmail: string,
  data: { title: string; target: number; emoji?: string }
): Promise<SavingsGoal> {
  const items = await getSavingsGoals(userEmail);
  const record: SavingsGoal = {
    id: crypto.randomUUID().replace(/-/g, ""),
    title: data.title,
    target: data.target,
    current: 0,
    emoji: data.emoji || "💰",
    createdAt: new Date().toISOString(),
  };
  items.push(record);
  await saveSavingsGoals(userEmail, items);
  return record;
}

export async function updateSavingsGoalAmount(
  userEmail: string,
  id: string,
  current: number
): Promise<void> {
  const items = await getSavingsGoals(userEmail);
  const idx = items.findIndex((g) => g.id === id);
  if (idx !== -1) {
    items[idx].current = Math.max(0, current);
    await saveSavingsGoals(userEmail, items);
  }
}

export async function removeSavingsGoal(userEmail: string, id: string): Promise<void> {
  const items = await getSavingsGoals(userEmail);
  await saveSavingsGoals(userEmail, items.filter((g) => g.id !== id));
}

// ---- Couple Goals -----------------------------------------------------------

export type CoupleGoal = {
  id: string;
  title: string;
  category: string;
  size: string;
  emoji: string;
  progress: number;
  isDone: boolean;
  targetDate: string | null;
  createdBy: string;
  createdAt: string;
};

export async function getCoupleGoals(userEmail: string): Promise<CoupleGoal[]> {
  const raw = await getCoupleRaw(userEmail, "couple_goals");
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function saveCoupleGoals(userEmail: string, items: CoupleGoal[]): Promise<void> {
  await setCoupleRaw(userEmail, "couple_goals", JSON.stringify(items));
}

export async function addCoupleGoal(
  userEmail: string,
  data: {
    title: string;
    category: string;
    size: string;
    emoji?: string;
    targetDate?: string | null;
    createdBy?: string;
  }
): Promise<CoupleGoal> {
  const items = await getCoupleGoals(userEmail);
  const record: CoupleGoal = {
    id: crypto.randomUUID().replace(/-/g, ""),
    title: data.title,
    category: data.category,
    size: data.size,
    emoji: data.emoji || "🎯",
    progress: 0,
    isDone: false,
    targetDate: data.targetDate ?? null,
    createdBy: data.createdBy || "",
    createdAt: new Date().toISOString(),
  };
  items.push(record);
  await saveCoupleGoals(userEmail, items);
  return record;
}

export async function updateCoupleGoalProgress(
  userEmail: string,
  id: string,
  progress: number
): Promise<void> {
  const items = await getCoupleGoals(userEmail);
  const idx = items.findIndex((g) => g.id === id);
  if (idx !== -1) {
    const pct = Math.max(0, Math.min(100, progress));
    items[idx].progress = pct;
    items[idx].isDone = pct === 100;
    await saveCoupleGoals(userEmail, items);
  }
}

export async function removeCoupleGoal(userEmail: string, id: string): Promise<void> {
  const items = await getCoupleGoals(userEmail);
  await saveCoupleGoals(userEmail, items.filter((g) => g.id !== id));
}

// ---- Bucket List ------------------------------------------------------------

export type BucketItem = {
  id: string;
  title: string;
  isDone: boolean;
  doneDate: string | null;
  createdAt: string;
};

export async function getBucketList(userEmail: string): Promise<BucketItem[]> {
  const raw = await getCoupleRaw(userEmail, "bucket_list");
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function saveBucketList(userEmail: string, items: BucketItem[]): Promise<void> {
  await setCoupleRaw(userEmail, "bucket_list", JSON.stringify(items));
}

export async function addBucketItem(userEmail: string, title: string): Promise<BucketItem> {
  const items = await getBucketList(userEmail);
  const record: BucketItem = {
    id: crypto.randomUUID().replace(/-/g, ""),
    title: title.trim(),
    isDone: false,
    doneDate: null,
    createdAt: new Date().toISOString(),
  };
  items.push(record);
  await saveBucketList(userEmail, items);
  return record;
}

export async function toggleBucketItem(userEmail: string, id: string): Promise<void> {
  const items = await getBucketList(userEmail);
  const idx = items.findIndex((b) => b.id === id);
  if (idx !== -1) {
    items[idx].isDone = !items[idx].isDone;
    items[idx].doneDate = items[idx].isDone ? new Date().toISOString().slice(0, 10) : null;
    await saveBucketList(userEmail, items);
  }
}

export async function removeBucketItem(userEmail: string, id: string): Promise<void> {
  const items = await getBucketList(userEmail);
  await saveBucketList(userEmail, items.filter((b) => b.id !== id));
}

// ---- Weekly Check-in --------------------------------------------------------

export async function getWeeklyCheckin(
  userEmail: string,
  weekIso: string
): Promise<string> {
  const raw = await getCoupleRaw(userEmail, `weekly_checkin::${weekIso}`);
  return raw || "";
}

export async function saveWeeklyCheckin(
  userEmail: string,
  weekIso: string,
  text: string
): Promise<void> {
  await setCoupleRaw(userEmail, `weekly_checkin::${weekIso}`, text.trim());
}
