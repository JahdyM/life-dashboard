import { randomUUID } from "crypto";
import despertaiCatalog from "@/lib/config/despertaiPublications.json";
import broadcastingCatalog from "@/lib/config/broadcastingVideos.json";
import videoCatalog from "@/lib/config/readingVideos.json";
import { BIBLE_BOOK_BY_KEY, BIBLE_SECTIONS, BIBLE_TOTAL_CHAPTERS } from "@/lib/config/bible";
import { getSetting, setSetting } from "@/lib/server/settings";
import type { DespertaiIssue, DespertaiTopic, ReadingPageData, ReadingVideo } from "@/lib/types";

type StoredDespertaiTopic = {
  id: string;
  title: string;
  read: boolean;
};

type StoredDespertaiIssue = {
  id: string;
  year: number;
  date_label: string | null;
  title: string;
  url?: string | null;
  topics: StoredDespertaiTopic[];
  created_at: string;
  updated_at: string;
};

type StoredReadingState = {
  despertai_issues: StoredDespertaiIssue[];
  videos: StoredReadingVideo[];
  broadcasting_videos: StoredReadingVideo[];
  bible_read_chapters: Record<string, number[]>;
};

const READING_STATE_KEY = "reading_state_v1";
const CATALOG_CREATED_AT = "2026-04-29T00:00:00.000Z";

type CatalogDespertaiIssue = {
  id: string;
  year: number;
  date_label?: string | null;
  title: string;
  url?: string | null;
  topics: string[];
};

type CatalogReadingVideo = {
  id: string;
  title: string;
  duration_seconds?: number;
  natural_key?: string | null;
  document_id?: string | null;
  url?: string | null;
};

type StoredReadingVideo = {
  id: string;
  title: string;
  duration_seconds: number;
  natural_key?: string | null;
  document_id?: string | null;
  url?: string | null;
  read: boolean;
  created_at: string;
  updated_at: string;
};

const DEFAULT_DESPERTAI_ISSUES: StoredDespertaiIssue[] = (despertaiCatalog as CatalogDespertaiIssue[])
  .map((issue) => ({
    id: issue.id,
    year: issue.year,
    date_label: issue.date_label || null,
    title: issue.title,
    url: issue.url || null,
    topics: issue.topics.map((title, index) => ({
      id: `${issue.id}-topic-${index + 1}`,
      title,
      read: false,
    })),
    created_at: CATALOG_CREATED_AT,
    updated_at: CATALOG_CREATED_AT,
  }));

const DEFAULT_READING_VIDEOS: StoredReadingVideo[] = (videoCatalog as CatalogReadingVideo[])
  .map((video) => ({
    id: video.id,
    title: video.title,
    duration_seconds: Math.max(0, Math.trunc(Number(video.duration_seconds) || 0)),
    natural_key: video.natural_key || null,
    document_id: video.document_id || null,
    url: video.url || null,
    read: false,
    created_at: CATALOG_CREATED_AT,
    updated_at: CATALOG_CREATED_AT,
  }));

const DEFAULT_BROADCASTING_VIDEOS: StoredReadingVideo[] = (broadcastingCatalog as CatalogReadingVideo[])
  .map((video) => ({
    id: video.id,
    title: video.title,
    duration_seconds: Math.max(0, Math.trunc(Number(video.duration_seconds) || 0)),
    natural_key: video.natural_key || null,
    document_id: video.document_id || null,
    url: video.url || null,
    read: false,
    created_at: CATALOG_CREATED_AT,
    updated_at: CATALOG_CREATED_AT,
  }));

function defaultState(): StoredReadingState {
  return {
    despertai_issues: DEFAULT_DESPERTAI_ISSUES,
    videos: DEFAULT_READING_VIDEOS,
    broadcasting_videos: DEFAULT_BROADCASTING_VIDEOS,
    bible_read_chapters: {},
  };
}

function normalizeText(value: unknown, max = 220) {
  const clean = String(value ?? "").trim().replace(/\s+/g, " ");
  return clean.slice(0, max);
}

function normalizeYear(value: unknown) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  return year;
}

function normalizeTopic(raw: Partial<StoredDespertaiTopic>, nowIso: string): StoredDespertaiTopic | null {
  const title = normalizeText(raw.title, 260);
  if (!title) return null;
  return {
    id: String(raw.id || randomUUID()),
    title,
    read: Boolean(raw.read),
  };
}

function normalizeIssue(raw: Partial<StoredDespertaiIssue>, nowIso: string): StoredDespertaiIssue | null {
  const title = normalizeText(raw.title, 260);
  const year = normalizeYear(raw.year);
  if (!title || year === null) return null;
  const topics = Array.isArray(raw.topics)
    ? raw.topics
        .map((topic) => normalizeTopic(topic, nowIso))
        .filter((topic): topic is StoredDespertaiTopic => Boolean(topic))
    : [];

  return {
    id: String(raw.id || randomUUID()),
    year,
    date_label: normalizeText(raw.date_label, 80) || null,
    title,
    url: normalizeText(raw.url, 600) || null,
    topics,
    created_at: String(raw.created_at || nowIso),
    updated_at: String(raw.updated_at || nowIso),
  };
}

function normalizeVideo(raw: Partial<StoredReadingVideo>, nowIso: string): StoredReadingVideo | null {
  const title = normalizeText(raw.title, 280);
  if (!title) return null;
  return {
    id: String(raw.id || randomUUID()),
    title,
    duration_seconds: Math.max(0, Math.trunc(Number(raw.duration_seconds) || 0)),
    natural_key: normalizeText(raw.natural_key, 160) || null,
    document_id: normalizeText(raw.document_id, 160) || null,
    url: normalizeText(raw.url, 600) || null,
    read: Boolean(raw.read),
    created_at: String(raw.created_at || nowIso),
    updated_at: String(raw.updated_at || nowIso),
  };
}

function mergeWithDefaultIssues(issues: StoredDespertaiIssue[]) {
  return mergeIssues(DEFAULT_DESPERTAI_ISSUES, issues);
}

function mergeWithDefaultVideos(videos: StoredReadingVideo[], defaults = DEFAULT_READING_VIDEOS) {
  const next = [...defaults];
  videos.forEach((video) => {
    const existingIndex = next.findIndex((item) => item.id === video.id);
    if (existingIndex < 0) {
      next.push(video);
      return;
    }
    next[existingIndex] = {
      ...next[existingIndex],
      ...video,
      read: Boolean(video.read),
    };
  });
  return next;
}

function normalizeBibleReadChapters(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, number[]> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([bookKey, value]) => {
    const book = BIBLE_BOOK_BY_KEY.get(bookKey);
    if (!book || !Array.isArray(value)) return;
    const chapters = Array.from(
      new Set(
        value
          .map((chapter) => Number(chapter))
          .filter((chapter) => Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters)
      )
    ).sort((left, right) => left - right);
    if (chapters.length) next[bookKey] = chapters;
  });
  return next;
}

function normalizeState(raw: unknown): StoredReadingState {
  if (!raw || typeof raw !== "object") return defaultState();
  const state = raw as Partial<StoredReadingState>;
  const nowIso = new Date().toISOString();
  return {
    despertai_issues: Array.isArray(state.despertai_issues)
      ? mergeWithDefaultIssues(state.despertai_issues
          .map((issue) => normalizeIssue(issue, nowIso))
          .filter((issue): issue is StoredDespertaiIssue => Boolean(issue)))
      : DEFAULT_DESPERTAI_ISSUES,
    videos: Array.isArray(state.videos)
      ? mergeWithDefaultVideos(state.videos
          .map((video) => normalizeVideo(video, nowIso))
          .filter((video): video is StoredReadingVideo => Boolean(video)))
      : DEFAULT_READING_VIDEOS,
    broadcasting_videos: Array.isArray(state.broadcasting_videos)
      ? mergeWithDefaultVideos(
          state.broadcasting_videos
            .map((video) => normalizeVideo(video, nowIso))
            .filter((video): video is StoredReadingVideo => Boolean(video)),
          DEFAULT_BROADCASTING_VIDEOS
        )
      : DEFAULT_BROADCASTING_VIDEOS,
    bible_read_chapters: normalizeBibleReadChapters(state.bible_read_chapters),
  };
}

async function getState(userEmail: string) {
  const raw = await getSetting(userEmail, READING_STATE_KEY);
  if (!raw) return defaultState();
  try {
    return normalizeState(JSON.parse(raw));
  } catch (_error) {
    return defaultState();
  }
}

async function saveState(userEmail: string, state: StoredReadingState) {
  await setSetting(userEmail, READING_STATE_KEY, JSON.stringify(normalizeState(state)));
}

function issueProgress(issue: StoredDespertaiIssue): DespertaiIssue {
  const topics: DespertaiTopic[] = issue.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    read: Boolean(topic.read),
  }));
  const totalTopics = topics.length;
  const readCount = topics.filter((topic) => topic.read).length;
  const progressPercent = totalTopics ? Math.round((readCount / totalTopics) * 100) : 0;

  return {
    id: issue.id,
    year: issue.year,
    dateLabel: issue.date_label,
    title: issue.title,
    url: issue.url || null,
    topics,
    readCount,
    totalTopics,
    progressPercent,
    isFinished: totalTopics > 0 && readCount === totalTopics,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

function sortIssues(left: DespertaiIssue, right: DespertaiIssue) {
  if (left.year !== right.year) return right.year - left.year;
  const leftDate = left.dateLabel || "";
  const rightDate = right.dateLabel || "";
  if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
  return right.updatedAt.localeCompare(left.updatedAt);
}

function videoProgress(video: StoredReadingVideo): ReadingVideo {
  return {
    id: video.id,
    title: video.title,
    durationSeconds: video.duration_seconds,
    naturalKey: video.natural_key || null,
    documentId: video.document_id || null,
    url: video.url || null,
    read: Boolean(video.read),
    createdAt: video.created_at,
    updatedAt: video.updated_at,
  };
}

function sortVideos(left: ReadingVideo, right: ReadingVideo) {
  return left.title.localeCompare(right.title, "pt-BR");
}

function videoSectionProgress(videos: StoredReadingVideo[]) {
  const allVideos = videos.map(videoProgress);
  const pendingVideosList = allVideos.filter((video) => !video.read).sort(sortVideos);
  const finishedVideosList = allVideos.filter((video) => video.read).sort(sortVideos);
  const totalDurationSeconds = allVideos.reduce((sum, video) => sum + video.durationSeconds, 0);
  const watchedDurationSeconds = finishedVideosList.reduce((sum, video) => sum + video.durationSeconds, 0);

  return {
    totalVideos: allVideos.length,
    finishedVideos: finishedVideosList.length,
    pendingVideos: pendingVideosList.length,
    totalDurationSeconds,
    watchedDurationSeconds,
    progressPercent: allVideos.length ? Math.round((finishedVideosList.length / allVideos.length) * 100) : 0,
    pendingVideosList,
    finishedVideosList,
  };
}

function toPageData(state: StoredReadingState): ReadingPageData {
  const issues = state.despertai_issues.map(issueProgress);
  const pendingIssues = issues.filter((issue) => !issue.isFinished).sort(sortIssues);
  const finishedIssuesList = issues.filter((issue) => issue.isFinished).sort(sortIssues);
  const totalTopics = issues.reduce((sum, issue) => sum + issue.totalTopics, 0);
  const readTopics = issues.reduce((sum, issue) => sum + issue.readCount, 0);
  const videos = videoSectionProgress(state.videos);
  const broadcasting = videoSectionProgress(state.broadcasting_videos);

  const sections = BIBLE_SECTIONS.map((section) => ({
    title: section.title,
    books: section.books.map((book) => {
      const readChapters = state.bible_read_chapters[book.key] || [];
      return {
        key: book.key,
        name: book.name,
        chapters: book.chapters,
        readChapters,
        readCount: readChapters.length,
        progressPercent: book.chapters ? Math.round((readChapters.length / book.chapters) * 100) : 0,
      };
    }),
  }));
  const readBibleChapters = Object.values(state.bible_read_chapters).reduce(
    (sum, chapters) => sum + chapters.length,
    0
  );

  return {
    despertai: {
      totalIssues: issues.length,
      finishedIssues: finishedIssuesList.length,
      totalTopics,
      readTopics,
      progressPercent: totalTopics ? Math.round((readTopics / totalTopics) * 100) : 0,
      pendingIssues,
      finishedIssuesList,
    },
    videos,
    broadcasting,
    bible: {
      totalChapters: BIBLE_TOTAL_CHAPTERS,
      readChapters: readBibleChapters,
      progressPercent: Math.round((readBibleChapters / BIBLE_TOTAL_CHAPTERS) * 100),
      sections,
    },
  };
}

function splitCsvLine(line: string) {
  const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function topicListFromText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item, 260)).filter(Boolean);
  }
  return String(value ?? "")
    .split(/\s*(?:\||;|•|\n)\s*/)
    .map((item) => normalizeText(item, 260))
    .filter(Boolean);
}

function parseJsonImport(raw: string, nowIso: string): StoredDespertaiIssue[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((item) => {
        const row = item as Record<string, unknown>;
        const topics = topicListFromText(row.topics ?? row.topicos ?? row.topic ?? row.topico);
        return normalizeIssue(
          {
            year: row.year as number,
            date_label: normalizeText(row.date ?? row.data ?? row.month ?? row.mes, 80) || null,
            title: normalizeText(row.title ?? row.titulo ?? row.issue ?? row.revista, 260),
            url: normalizeText(row.url, 600) || null,
            topics: topics.map((title) => ({ id: randomUUID(), title, read: false })),
            created_at: nowIso,
            updated_at: nowIso,
          },
          nowIso
        );
      })
      .filter((issue): issue is StoredDespertaiIssue => Boolean(issue));
  } catch (_error) {
    return null;
  }
}

function parseTableImport(raw: string, nowIso: string): StoredDespertaiIssue[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const firstCells = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = firstCells.some((cell) => ["year", "ano", "title", "titulo", "título", "topic", "topico", "tópico"].includes(cell));
  const header = hasHeader ? firstCells : [];
  const rows = hasHeader ? lines.slice(1) : lines;
  const indexFor = (aliases: string[], fallback: number) => {
    const index = header.findIndex((cell) => aliases.includes(cell));
    return index >= 0 ? index : fallback;
  };
  const yearIndex = indexFor(["year", "ano"], 0);
  const dateIndex = indexFor(["date", "data", "month", "mes", "mês"], 1);
  const titleIndex = indexFor(["title", "titulo", "título", "issue", "revista"], hasHeader ? 2 : 1);
  const topicIndex = indexFor(["topic", "topico", "tópico", "topics", "topicos", "tópicos"], hasHeader ? 3 : 2);
  const grouped = new Map<string, StoredDespertaiIssue>();

  rows.forEach((line) => {
    const cells = splitCsvLine(line);
    const year = normalizeYear(cells[yearIndex]);
    const title = normalizeText(cells[titleIndex], 260);
    if (year === null || !title) return;
    const dateLabel = normalizeText(cells[dateIndex], 80) || null;
    const urlIndex = indexFor(["url", "link"], 6);
    const url = normalizeText(cells[urlIndex], 600) || null;
    const topics = topicListFromText(cells[topicIndex] || title);
    const groupKey = `${year}::${dateLabel || ""}::${title}`.toLowerCase();
    const existing = grouped.get(groupKey);
    if (existing) {
      topics.forEach((topicTitle) => {
        if (!existing.topics.some((topic) => topic.title.toLowerCase() === topicTitle.toLowerCase())) {
          existing.topics.push({ id: randomUUID(), title: topicTitle, read: false });
        }
      });
      existing.updated_at = nowIso;
      return;
    }

    const issue = normalizeIssue(
      {
        year,
        date_label: dateLabel,
        title,
        url,
        topics: topics.map((topicTitle) => ({ id: randomUUID(), title: topicTitle, read: false })),
        created_at: nowIso,
        updated_at: nowIso,
      },
      nowIso
    );
    if (issue) grouped.set(groupKey, issue);
  });

  return Array.from(grouped.values());
}

function parseDespertaiImport(raw: string) {
  const nowIso = new Date().toISOString();
  const jsonItems = parseJsonImport(raw, nowIso);
  if (jsonItems) return jsonItems;
  return parseTableImport(raw, nowIso);
}

function mergeIssues(current: StoredDespertaiIssue[], incoming: StoredDespertaiIssue[]) {
  const next = [...current];
  incoming.forEach((issue) => {
    const existingIndex = next.findIndex(
      (item) =>
        item.year === issue.year &&
        item.title.toLowerCase() === issue.title.toLowerCase() &&
        String(item.date_label || "").toLowerCase() === String(issue.date_label || "").toLowerCase()
    );
    if (existingIndex < 0) {
      next.push(issue);
      return;
    }
    const existing = next[existingIndex];
    const topics = [...existing.topics];
    issue.topics.forEach((topic) => {
      const existingTopicIndex = topics.findIndex(
        (item) => item.title.toLowerCase() === topic.title.toLowerCase()
      );
      if (existingTopicIndex >= 0) {
        topics[existingTopicIndex] = {
          ...topics[existingTopicIndex],
          read: topics[existingTopicIndex].read || topic.read,
        };
      } else {
        topics.push(topic);
      }
    });
    next[existingIndex] = {
      ...existing,
      url: existing.url || issue.url || null,
      topics,
      updated_at: new Date().toISOString(),
    };
  });
  return next;
}

export async function getReadingPageData(userEmail: string) {
  return toPageData(await getState(userEmail));
}

export async function importDespertaiIssues(userEmail: string, raw: string) {
  const incoming = parseDespertaiImport(raw);
  const state = await getState(userEmail);
  const nextState = {
    ...state,
    despertai_issues: mergeIssues(state.despertai_issues, incoming),
  };
  await saveState(userEmail, nextState);
  return toPageData(nextState);
}

export async function setDespertaiTopicRead(
  userEmail: string,
  issueId: string,
  topicId: string,
  read: boolean
) {
  const state = await getState(userEmail);
  const nowIso = new Date().toISOString();
  const nextIssues = state.despertai_issues.map((issue) => {
    if (issue.id !== issueId) return issue;
    return {
      ...issue,
      topics: issue.topics.map((topic) =>
        topic.id === topicId ? { ...topic, read } : topic
      ),
      updated_at: nowIso,
    };
  });
  const nextState = { ...state, despertai_issues: nextIssues };
  await saveState(userEmail, nextState);
  return toPageData(nextState);
}

export async function setDespertaiIssueRead(userEmail: string, issueId: string, read: boolean) {
  const state = await getState(userEmail);
  const nowIso = new Date().toISOString();
  const nextIssues = state.despertai_issues.map((issue) => {
    if (issue.id !== issueId) return issue;
    return {
      ...issue,
      topics: issue.topics.map((topic) => ({ ...topic, read })),
      updated_at: nowIso,
    };
  });
  const nextState = { ...state, despertai_issues: nextIssues };
  await saveState(userEmail, nextState);
  return toPageData(nextState);
}

export async function setDespertaiIssueReadCount(userEmail: string, issueId: string, readCount: number) {
  const state = await getState(userEmail);
  const nowIso = new Date().toISOString();
  const nextIssues = state.despertai_issues.map((issue) => {
    if (issue.id !== issueId) return issue;
    const count = Math.max(0, Math.min(issue.topics.length, Math.trunc(Number(readCount) || 0)));
    return {
      ...issue,
      topics: issue.topics.map((topic, index) => ({ ...topic, read: index < count })),
      updated_at: nowIso,
    };
  });
  const nextState = { ...state, despertai_issues: nextIssues };
  await saveState(userEmail, nextState);
  return toPageData(nextState);
}

export async function setReadingVideoRead(userEmail: string, videoId: string, read: boolean) {
  const state = await getState(userEmail);
  const nowIso = new Date().toISOString();
  const nextVideos = state.videos.map((video) =>
    video.id === videoId ? { ...video, read, updated_at: nowIso } : video
  );
  const nextState = { ...state, videos: nextVideos };
  await saveState(userEmail, nextState);
  return toPageData(nextState);
}

export async function setBroadcastingVideoRead(userEmail: string, videoId: string, read: boolean) {
  const state = await getState(userEmail);
  const nowIso = new Date().toISOString();
  const nextVideos = state.broadcasting_videos.map((video) =>
    video.id === videoId ? { ...video, read, updated_at: nowIso } : video
  );
  const nextState = { ...state, broadcasting_videos: nextVideos };
  await saveState(userEmail, nextState);
  return toPageData(nextState);
}

export async function setBibleChapterRead(
  userEmail: string,
  bookKey: string,
  chapter: number,
  read: boolean
) {
  const book = BIBLE_BOOK_BY_KEY.get(bookKey);
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
    throw new Error("INVALID_BIBLE_CHAPTER");
  }
  const state = await getState(userEmail);
  const current = new Set(state.bible_read_chapters[bookKey] || []);
  if (read) current.add(chapter);
  else current.delete(chapter);
  const nextChapters = Array.from(current).sort((left, right) => left - right);
  const bibleReadChapters = { ...state.bible_read_chapters };
  if (nextChapters.length) bibleReadChapters[bookKey] = nextChapters;
  else delete bibleReadChapters[bookKey];
  const nextState = { ...state, bible_read_chapters: bibleReadChapters };
  await saveState(userEmail, nextState);
  return toPageData(nextState);
}
