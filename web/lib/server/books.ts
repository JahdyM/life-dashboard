import { randomUUID } from "crypto";
import { getSetting, setSetting } from "@/lib/server/settings";
import type { BookEntry, BookEntryStatus, BooksPageData } from "@/lib/types";

type StoredBookEntry = {
  id: string;
  year: number;
  title: string;
  author: string | null;
  cover_url: string | null;
  total_pages: number | null;
  pages_read: number;
  status: BookEntryStatus;
  rating: number | null;
  created_at: string;
  updated_at: string;
};

type StoredBooksState = {
  yearly_goal_by_year: Record<string, number>;
  items: StoredBookEntry[];
};

const BOOKS_STATE_KEY = "books_state_v1";

function defaultBooksState(): StoredBooksState {
  return {
    yearly_goal_by_year: {},
    items: [],
  };
}

function normalizeText(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeCoverUrl(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.toString();
  } catch (_error) {
    return null;
  }
}

function clampPages(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.min(20_000, Math.max(1, Math.trunc(Number(value))));
}

function clampPagesRead(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  return Math.min(20_000, Math.max(0, Math.trunc(Number(value))));
}

function normalizeStatus(value: string | null | undefined): BookEntryStatus {
  if (value === "finished" || value === "planned") return value;
  return "reading";
}

function normalizeRating(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const rounded = Math.trunc(Number(value));
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function statusOrder(status: BookEntryStatus) {
  if (status === "reading") return 0;
  if (status === "planned") return 1;
  return 2;
}

function toBookEntry(item: StoredBookEntry): BookEntry {
  return {
    id: item.id,
    year: item.year,
    title: item.title,
    author: item.author,
    coverUrl: item.cover_url,
    totalPages: item.total_pages,
    pagesRead: item.pages_read,
    status: item.status,
    rating: item.rating,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function normalizeStoredBook(raw: Partial<StoredBookEntry>, nowIso: string): StoredBookEntry | null {
  const title = normalizeText(raw.title);
  const year = Number(raw.year);
  if (!title || !Number.isInteger(year) || year < 2000 || year > 2100) return null;

  const totalPages = clampPages(raw.total_pages ?? null);
  let pagesRead = clampPagesRead(raw.pages_read ?? 0);
  if (totalPages !== null) {
    pagesRead = Math.min(pagesRead, totalPages);
  }

  let status = normalizeStatus(raw.status);
  if (status === "finished" && totalPages !== null) {
    pagesRead = totalPages;
  }
  if (status !== "finished" && totalPages !== null && pagesRead >= totalPages && totalPages > 0) {
    status = "finished";
  }

  const rating = status === "finished" ? normalizeRating(raw.rating) : null;

  return {
    id: String(raw.id || randomUUID()),
    year,
    title,
    author: normalizeText(raw.author),
    cover_url: normalizeCoverUrl(raw.cover_url),
    total_pages: totalPages,
    pages_read: pagesRead,
    status,
    rating,
    created_at: raw.created_at || nowIso,
    updated_at: nowIso,
  };
}

async function loadBooksState(userEmail: string): Promise<StoredBooksState> {
  const raw = await getSetting(userEmail, BOOKS_STATE_KEY);
  if (!raw) return defaultBooksState();

  try {
    const parsed = JSON.parse(raw) as Partial<StoredBooksState>;
    if (!parsed || typeof parsed !== "object") return defaultBooksState();
    const yearly =
      parsed.yearly_goal_by_year && typeof parsed.yearly_goal_by_year === "object"
        ? Object.entries(parsed.yearly_goal_by_year).reduce<Record<string, number>>(
            (acc, [year, goal]) => {
              const numericYear = Number(year);
              const numericGoal = Number(goal);
              if (
                Number.isInteger(numericYear) &&
                numericYear >= 2000 &&
                numericYear <= 2100 &&
                Number.isInteger(numericGoal) &&
                numericGoal >= 0
              ) {
                acc[String(numericYear)] = Math.min(500, numericGoal);
              }
              return acc;
            },
            {}
          )
        : {};

    const nowIso = new Date().toISOString();
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((item) => normalizeStoredBook(item, nowIso))
          .filter((item): item is StoredBookEntry => Boolean(item))
      : [];

    return {
      yearly_goal_by_year: yearly,
      items,
    };
  } catch (_error) {
    return defaultBooksState();
  }
}

async function saveBooksState(userEmail: string, state: StoredBooksState) {
  await setSetting(userEmail, BOOKS_STATE_KEY, JSON.stringify(state));
}

function buildBooksPageData(state: StoredBooksState, year: number): BooksPageData {
  const items = state.items
    .filter((item) => item.year === year)
    .sort((left, right) => {
      const statusDiff = statusOrder(left.status) - statusOrder(right.status);
      if (statusDiff !== 0) return statusDiff;
      return right.updated_at.localeCompare(left.updated_at);
    })
    .map(toBookEntry);

  const yearlyGoal = Number(state.yearly_goal_by_year[String(year)] || 0);
  const finishedCount = items.filter((item) => item.status === "finished").length;
  const readingCount = items.filter((item) => item.status === "reading").length;
  const progressPercent = yearlyGoal > 0 ? Math.round((finishedCount / yearlyGoal) * 100) : 0;

  return {
    year,
    yearlyGoal,
    finishedCount,
    readingCount,
    totalCount: items.length,
    progressPercent,
    items,
  };
}

export async function getBooksPageData(userEmail: string, year: number): Promise<BooksPageData> {
  const state = await loadBooksState(userEmail);
  return buildBooksPageData(state, year);
}

export async function updateBooksGoal(args: {
  userEmail: string;
  year: number;
  yearlyGoal: number;
}): Promise<BooksPageData> {
  const { userEmail, year, yearlyGoal } = args;
  const state = await loadBooksState(userEmail);
  state.yearly_goal_by_year[String(year)] = Math.min(500, Math.max(0, Math.trunc(yearlyGoal)));
  await saveBooksState(userEmail, state);
  return buildBooksPageData(state, year);
}

export async function createBook(args: {
  userEmail: string;
  year: number;
  title: string;
  author?: string | null;
  coverUrl?: string | null;
  totalPages?: number | null;
  pagesRead?: number;
  status?: BookEntryStatus;
  rating?: number | null;
}): Promise<{ item: BookEntry; data: BooksPageData }> {
  const { userEmail } = args;
  const nowIso = new Date().toISOString();
  const state = await loadBooksState(userEmail);
  const created = normalizeStoredBook(
    {
      id: randomUUID(),
      year: args.year,
      title: args.title,
      author: args.author ?? null,
      cover_url: args.coverUrl ?? null,
      total_pages: args.totalPages ?? null,
      pages_read: args.pagesRead ?? 0,
      status: args.status ?? "reading",
      rating: args.rating ?? null,
      created_at: nowIso,
      updated_at: nowIso,
    },
    nowIso
  );

  if (!created) {
    throw new Error("INVALID_BOOK");
  }

  state.items.push(created);
  await saveBooksState(userEmail, state);
  return {
    item: toBookEntry(created),
    data: buildBooksPageData(state, created.year),
  };
}

export async function updateBook(args: {
  userEmail: string;
  bookId: string;
  patch: {
    year?: number;
    title?: string;
    author?: string | null;
    coverUrl?: string | null;
    totalPages?: number | null;
    pagesRead?: number;
    status?: BookEntryStatus;
    rating?: number | null;
  };
}): Promise<{ item: BookEntry; data: BooksPageData }> {
  const { userEmail, bookId, patch } = args;
  const state = await loadBooksState(userEmail);
  const index = state.items.findIndex((item) => item.id === bookId);
  if (index < 0) {
    throw new Error("RESOURCE_NOT_FOUND");
  }

  const existing = state.items[index];
  const nowIso = new Date().toISOString();
  const normalized = normalizeStoredBook(
    {
      ...existing,
      year: patch.year ?? existing.year,
      title: patch.title ?? existing.title,
      author: patch.author !== undefined ? patch.author : existing.author,
      cover_url: patch.coverUrl !== undefined ? patch.coverUrl : existing.cover_url,
      total_pages: patch.totalPages !== undefined ? patch.totalPages : existing.total_pages,
      pages_read: patch.pagesRead !== undefined ? patch.pagesRead : existing.pages_read,
      status: patch.status ?? existing.status,
      rating: patch.rating !== undefined ? patch.rating : existing.rating,
      created_at: existing.created_at,
      updated_at: nowIso,
    },
    nowIso
  );

  if (!normalized) {
    throw new Error("INVALID_BOOK");
  }

  state.items[index] = normalized;
  await saveBooksState(userEmail, state);
  return {
    item: toBookEntry(normalized),
    data: buildBooksPageData(state, normalized.year),
  };
}

export async function deleteBook(args: {
  userEmail: string;
  bookId: string;
  year: number;
}): Promise<BooksPageData> {
  const { userEmail, bookId, year } = args;
  const state = await loadBooksState(userEmail);
  const nextItems = state.items.filter((item) => item.id !== bookId);
  if (nextItems.length === state.items.length) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  state.items = nextItems;
  await saveBooksState(userEmail, state);
  return buildBooksPageData(state, year);
}
