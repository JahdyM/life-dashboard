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

// ---- Monthly Finance (budget-based model matching their Excel) ---------------

export type PaidStatus = "pago" | "nao_pago" | "sim" | "nao";

export type FixedCostItem = {
  id: string;
  label: string;
  budget: number;
  actual: number | null;
  paid: PaidStatus;
};

export type MonthlyIncome = {
  gui: number;
  jahdy: number | null; // null = sem salário esse mês
  extras: number;
};

export type DebtEntry = {
  label: string;
  total: number;    // total outstanding
  monthly: number;  // amount due / to pay this month
  paid: number;     // already paid this month
};

export type MonthlyDebts = Record<string, DebtEntry>;

export type ExtraExpense = {
  id: string;
  label: string;
  amount: number;
};

export type MonthlyFinance = {
  income: MonthlyIncome;
  fixedCosts: FixedCostItem[];
  debts: MonthlyDebts;
  extraExpenses: ExtraExpense[];
};

// Custos fixos padrão baseados na planilha real do casal
export const DEFAULT_FIXED_COSTS: Omit<FixedCostItem, "actual" | "paid">[] = [
  { id: "energia",      label: "Energia",           budget: 180  },
  { id: "agua",         label: "Água",               budget: 150  },
  { id: "mercado",      label: "Mercado",            budget: 1000 },
  { id: "internet",     label: "Internet",           budget: 150  },
  { id: "celular",      label: "Celular",            budget: 150  },
  { id: "gasolina",     label: "Gasolina",           budget: 200  },
  { id: "seguro_carro", label: "Seguro do carro",    budget: 100  },
  { id: "guarde_ja",    label: "Guarde Já",          budget: 290  },
  { id: "cassems",      label: "Cassems - Gui",      budget: 470  },
  { id: "academia",     label: "Academia",           budget: 120  },
  { id: "saude_plus",   label: "Saúde+",             budget: 390  },
  { id: "mei",          label: "MEI",                budget: 87   },
  { id: "das",          label: "DAS",                budget: 540  },
  { id: "contador_fixo",label: "Contador",           budget: 300  },
];

function debtLabelFromKey(key: string): string {
  const knownLabels: Record<string, string> = {
    contador: "Contador",
    nacional: "Nacional",
    cartao: "Cartão",
  };
  if (knownLabels[key]) return knownLabels[key];
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Dívida";
}

function makeDebt(label: string, total = 0, monthly = 0, paid = 0): DebtEntry {
  return { label, total, monthly, paid };
}

function makeDefaultFinance(year?: number, month?: number): MonthlyFinance {
  const blankCosts = DEFAULT_FIXED_COSTS.map((c) => ({
    ...c,
    actual: null as number | null,
    paid: "nao" as PaidStatus,
  }));

  function applyPaid(overrides: Record<string, { actual: number | null; paid: PaidStatus }>) {
    return blankCosts.map((c) => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c));
  }

  // Historical data seeded from the couple's Excel spreadsheet (despesas.xlsx)
  if (year === 2026 && month === 3) {
    return {
      income: { gui: 9000, jahdy: 3607, extras: 220 },
      fixedCosts: applyPaid({
        agua:         { actual: 116.24, paid: "pago" },
        internet:     { actual: 17.89,  paid: "pago" },
        celular:      { actual: 67.98,  paid: "pago" },
        seguro_carro: { actual: 90.5,   paid: "pago" },
        guarde_ja:    { actual: 290,    paid: "pago" },
        mei:          { actual: 176.19, paid: "pago" },
        das:          { actual: 540,    paid: "pago" },
        contador_fixo:{ actual: 300,    paid: "pago" },
      }),
      debts: {
        contador: makeDebt("Contador", 1600, 300, 300),
        nacional: makeDebt("Nacional", 7710, 618, 0),
        cartao:   makeDebt("Cartão", 8324.82, 8617.09, 8617.09),
      },
      extraExpenses: [],
    };
  }

  if (year === 2026 && month === 2) {
    return {
      income: { gui: 9000, jahdy: null, extras: 220 },
      fixedCosts: applyPaid({
        celular:      { actual: 87.98,  paid: "pago" },
        seguro_carro: { actual: 90.5,   paid: "pago" },
        guarde_ja:    { actual: 290,    paid: "pago" },
        mei:          { actual: 176.19, paid: "pago" },
        das:          { actual: 1080,   paid: "pago" },
        contador_fixo:{ actual: 300,    paid: "pago" },
      }),
      debts: {
        contador: makeDebt("Contador", 1900, 0, 0),
        nacional: makeDebt("Nacional", 7710, 0, 0),
        cartao:   makeDebt("Cartão", 5489.87, 0, 0),
      },
      extraExpenses: [],
    };
  }

  if (year === 2026 && month === 1) {
    return {
      income: { gui: 9000, jahdy: null, extras: 220 },
      fixedCosts: applyPaid({
        celular:      { actual: 87.98,  paid: "pago" },
        seguro_carro: { actual: 90.5,   paid: "pago" },
        guarde_ja:    { actual: 290,    paid: "pago" },
        mei:          { actual: 176.19, paid: "pago" },
        das:          { actual: 1080,   paid: "pago" },
        contador_fixo:{ actual: 300,    paid: "pago" },
      }),
      debts: {
        contador: makeDebt("Contador", 1900, 0, 0),
        nacional: makeDebt("Nacional", 7710, 0, 0),
        cartao:   makeDebt("Cartão", 5489.87, 0, 0),
      },
      extraExpenses: [],
    };
  }

  return {
    income: { gui: 9000, jahdy: null, extras: 220 },
    fixedCosts: blankCosts,
    debts: {
      contador: makeDebt("Contador"),
      nacional: makeDebt("Nacional"),
      cartao:   makeDebt("Cartão"),
    },
    extraExpenses: [],
  };
}

function financeKey(year: number, month: number) {
  return `monthly_finance::${year}::${month}`;
}

export async function getMonthlyFinance(
  userEmail: string,
  year: number,
  month: number
): Promise<MonthlyFinance> {
  const raw = await getCoupleRaw(userEmail, financeKey(year, month));
  if (!raw) return makeDefaultFinance(year, month);
  try {
    const parsed = JSON.parse(raw) as Partial<MonthlyFinance>;
    const def = makeDefaultFinance(year, month);
    // Merge: keep default fixed costs structure, override with saved values
    const savedCosts = Array.isArray(parsed.fixedCosts) ? parsed.fixedCosts : [];
    const savedById = new Map(savedCosts.map((c) => [c.id, c]));
    const fixedCosts = def.fixedCosts.map((defItem) => {
      const saved = savedById.get(defItem.id);
      return saved ? { ...defItem, ...saved } : defItem;
    });
    // Append any custom items not in defaults
    savedCosts.forEach((c) => {
      if (!def.fixedCosts.find((d) => d.id === c.id)) fixedCosts.push(c);
    });
    // Migrate old debt format (bare numbers) and keep custom debt rows.
    const rawDebts = (parsed.debts || {}) as Record<string, number | Partial<DebtEntry>>;
    const debtKeys = Array.from(new Set([...Object.keys(def.debts), ...Object.keys(rawDebts)]));
    const migratedDebts = Object.fromEntries(
      debtKeys.map((k) => {
        const v = rawDebts[k] ?? def.debts[k];
        const fallback = def.debts[k] ?? makeDebt(debtLabelFromKey(k));
        if (typeof v === "number") {
          return [k, { ...fallback, total: v }];
        }
        return [
          k,
          {
            ...fallback,
            ...v,
            label: typeof v?.label === "string" && v.label.trim() ? v.label.trim() : fallback.label,
          },
        ];
      })
    ) as MonthlyDebts;
    return {
      income: { ...def.income, ...(parsed.income || {}) },
      fixedCosts,
      debts: migratedDebts,
      extraExpenses: Array.isArray(parsed.extraExpenses) ? parsed.extraExpenses : [],
    };
  } catch {
    return makeDefaultFinance();
  }
}

export async function saveMonthlyFinance(
  userEmail: string,
  year: number,
  month: number,
  data: MonthlyFinance
): Promise<void> {
  await setCoupleRaw(userEmail, financeKey(year, month), JSON.stringify(data));
}

export function computeFinanceSummary(f: MonthlyFinance) {
  const totalIncome = (f.income.gui || 0) + (f.income.jahdy || 0) + (f.income.extras || 0);
  const totalBudget = f.fixedCosts.reduce((s, c) => s + c.budget, 0);
  const totalActual = f.fixedCosts.reduce((s, c) => s + (c.actual ?? 0), 0);
  const totalDebtsPaid = Object.values(f.debts).reduce((s, d) => s + (d.paid || 0), 0);
  const totalOutstanding = Object.values(f.debts).reduce((s, d) => s + (d.total || 0), 0);
  const totalExtras = (f.extraExpenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  const surplus = totalIncome - totalActual - totalDebtsPaid - totalExtras;
  // Divisão padrão do sobrado: 20% casa, 10% R.E., resto dívidas
  return {
    totalIncome,
    totalBudget,
    totalActual,
    totalDebtsPaid,
    totalOutstanding,
    totalExtras,
    surplus,
    allocation: {
      casa: surplus > 0 ? Math.round(surplus * 0.2 * 100) / 100 : 0,
      reservaEmergencia: surplus > 0 ? Math.round(surplus * 0.1 * 100) / 100 : 0,
      dividas: surplus > 0 ? Math.round(surplus * 0.7 * 100) / 100 : 0,
    },
  };
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

// Metas padrão pré-populadas com base na planilha
const DEFAULT_SAVINGS_GOALS: Omit<SavingsGoal, "createdAt">[] = [
  { id: "reserva_emergencia", title: "Reserva de emergência", target: 24762,  current: 0, emoji: "🛡️" },
  { id: "quitar_dividas",     title: "Quitar dívidas",        target: 17000,  current: 0, emoji: "💳" },
  { id: "casa",               title: "Casa própria",          target: 100000, current: 0, emoji: "🏠" },
  { id: "carro",              title: "Carro próprio",         target: 30000,  current: 0, emoji: "🚗" },
];

export async function getSavingsGoals(userEmail: string): Promise<SavingsGoal[]> {
  const raw = await getCoupleRaw(userEmail, "savings_goals");
  if (!raw) {
    const defaults = DEFAULT_SAVINGS_GOALS.map((g) => ({ ...g, createdAt: new Date().toISOString() }));
    await saveSavingsGoals(userEmail, defaults);
    return defaults;
  }
  try {
    let items: SavingsGoal[] = JSON.parse(raw);
    if (!Array.isArray(items)) return [];

    // Migrate: update casa target if still at old value
    let changed = false;
    items = items.map((g) => {
      if (g.id === "casa" && g.target === 50000) { changed = true; return { ...g, target: 100000 }; }
      return g;
    });

    // Migrate: add any missing default goals
    for (const def of DEFAULT_SAVINGS_GOALS) {
      if (!items.find((g) => g.id === def.id)) {
        items.push({ ...def, createdAt: new Date().toISOString() });
        changed = true;
      }
    }

    if (changed) await saveSavingsGoals(userEmail, items);
    return items;
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

export async function getWeeklyCheckin(userEmail: string, weekIso: string): Promise<string> {
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
