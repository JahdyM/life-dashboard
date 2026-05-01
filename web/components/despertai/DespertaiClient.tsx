"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import InlineActionNotice from "@/components/common/InlineActionNotice";
import { fetchJson } from "@/lib/client/api";
import type { DespertaiIssue, ReadingPageData, ReadingVideo } from "@/lib/types";

type ReadingPatchPayload =
  | { type: "import_despertai"; raw: string }
  | { type: "toggle_despertai_topic"; issue_id: string; topic_id: string; read: boolean }
  | { type: "toggle_despertai_issue"; issue_id: string; read: boolean }
  | { type: "set_despertai_read_count"; issue_id: string; read_count: number }
  | { type: "toggle_reading_video"; video_id: string; read: boolean }
  | { type: "toggle_broadcasting_video"; video_id: string; read: boolean }
  | { type: "toggle_bible_chapter"; book_key: string; chapter: number; read: boolean };

type DespertaiClientProps = {
  initialData: ReadingPageData;
};

type ProgressStyle = CSSProperties & {
  "--progress-angle": string;
};

type DespertaiWheelSegment = {
  issue: DespertaiIssue;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  span: number;
  color: string;
};

type VideoWheelSegment = {
  video: ReadingVideo;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  span: number;
  color: string;
};

const queryKey = ["reading-progress"] as const;
const DESPERTAI_WHEEL_CENTER = 130;
const DESPERTAI_WHEEL_RADIUS = 118;
const DESPERTAI_WHEEL_LABEL_RADIUS = 78;
const DESPERTAI_WHEEL_SPIN_DURATION_MS = 2600;
const DESPERTAI_WHEEL_COLORS = [
  "#81623a",
  "#54677a",
  "#77558a",
  "#4f745e",
  "#9a6a56",
  "#5e6f90",
  "#8a5d73",
  "#627854",
];

function hashWheelSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: number) {
  const arr = [...items];
  const random = createSeededRandom(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function polar(cx: number, cy: number, radius: number, angleDegFromTop: number) {
  const radians = (Math.PI / 180) * angleDegFromTop;
  return {
    x: cx + radius * Math.sin(radians),
    y: cy - radius * Math.cos(radians),
  };
}

function describeWheelSlice(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function truncateWheelLabel(text: string, maxLength: number) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return "Despertai";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function matchesSearchText(value: string, searchTerm: string) {
  if (!searchTerm) return true;
  const normalizedValue = normalizeSearchText(value);
  return searchTerm
    .split(" ")
    .filter(Boolean)
    .every((term) => normalizedValue.includes(term));
}

function optionalPositiveNumber(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function findWheelSegmentAtPointer<T extends { startAngle: number; endAngle: number }>(
  segments: T[],
  rotationDeg: number
) {
  if (!segments.length) return null;
  const pointerAngle = ((-rotationDeg % 360) + 360) % 360;
  return (
    segments.find(
      (segment) =>
        pointerAngle >= segment.startAngle && pointerAngle < segment.endAngle
    ) || segments[segments.length - 1]
  );
}

function issueElementId(issueId: string) {
  return `despertai-issue-${issueId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function videoElementId(videoId: string) {
  return `reading-video-${videoId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function broadcastingElementId(videoId: string) {
  return `broadcasting-video-${videoId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min`;
  return `${total}s`;
}

function videoMetaLabel(video: ReadingVideo, fallback = "Vídeo") {
  return video.durationSeconds > 0 ? formatDuration(video.durationSeconds) : fallback;
}

function progressStyle(value: number): ProgressStyle {
  const progress = Math.max(0, Math.min(100, value));
  return { "--progress-angle": `${progress * 3.6}deg` } as ProgressStyle;
}

function ProgressDonut({ value, label }: { value: number; label: string }) {
  return (
    <div className="reading-donut" style={progressStyle(value)} aria-label={label ? `${label}: ${value}%` : `${value}%`}>
      <strong>{value}%</strong>
      {label ? <span>{label}</span> : null}
    </div>
  );
}

function IssueCard({
  issue,
  onPatch,
  busy,
  expanded,
  onToggleExpanded,
  selected,
}: {
  issue: DespertaiIssue;
  onPatch: (payload: ReadingPatchPayload) => void;
  busy: boolean;
  expanded: boolean;
  onToggleExpanded: (issueId: string) => void;
  selected: boolean;
}) {
  return (
    <article
      id={issueElementId(issue.id)}
      className={`despertai-issue-card ${issue.isFinished ? "finished" : ""} ${selected ? "wheel-selected" : ""}`}
    >
      <div className="despertai-issue-head">
        <ProgressDonut value={issue.progressPercent} label="lido" />
        <div className="despertai-issue-title-block">
          <p className="panel-kicker">{issue.year}{issue.dateLabel ? ` · ${issue.dateLabel}` : ""}</p>
          <button
            type="button"
            className="despertai-issue-title-button"
            onClick={() => onToggleExpanded(issue.id)}
            aria-expanded={expanded}
          >
            {issue.title}
          </button>
          <p>{issue.readCount}/{issue.totalTopics} tópicos</p>
          {issue.url ? (
            <a href={issue.url} target="_blank" rel="noreferrer" className="despertai-source-link">
              Abrir publicação
            </a>
          ) : null}
        </div>
        <label className="despertai-read-all">
          <input
            type="checkbox"
            checked={issue.isFinished}
            disabled={busy || issue.totalTopics === 0}
            onChange={(event) =>
              onPatch({
                type: "toggle_despertai_issue",
                issue_id: issue.id,
                read: event.target.checked,
              })
            }
          />
          <span>Lida</span>
        </label>
      </div>

      <label className="despertai-count-field">
        <span>Tópicos lidos</span>
        <input
          type="number"
          min="0"
          max={issue.totalTopics}
          defaultValue={issue.readCount}
          disabled={busy || issue.totalTopics === 0}
          onBlur={(event) => {
            const value = Number(event.currentTarget.value || 0);
            if (value === issue.readCount) return;
            onPatch({ type: "set_despertai_read_count", issue_id: issue.id, read_count: value });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </label>

      {expanded ? (
        <div className="despertai-topic-grid">
          {issue.topics.length ? (
            issue.topics.map((topic) => (
              <label key={topic.id} className={`despertai-topic ${topic.read ? "read" : ""}`}>
                <input
                  type="checkbox"
                  checked={topic.read}
                  disabled={busy}
                  onChange={(event) =>
                    onPatch({
                      type: "toggle_despertai_topic",
                      issue_id: issue.id,
                      topic_id: topic.id,
                      read: event.target.checked,
                    })
                  }
                />
                <span>{topic.title}</span>
              </label>
            ))
          ) : (
            <p className="line-empty">Sem tópicos.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function VideoCard({
  video,
  onPatch,
  busy,
  selected,
  elementId,
  toggleType,
}: {
  video: ReadingVideo;
  onPatch: (payload: ReadingPatchPayload) => void;
  busy: boolean;
  selected: boolean;
  elementId: string;
  toggleType: "toggle_reading_video" | "toggle_broadcasting_video";
}) {
  return (
    <article
      id={elementId}
      className={`reading-video-card ${video.read ? "finished" : ""} ${selected ? "wheel-selected" : ""}`}
    >
      <div className="reading-video-main">
        <div>
          <p className="panel-kicker">{videoMetaLabel(video)}</p>
          <h4>{video.title}</h4>
          {video.naturalKey ? <p>{video.naturalKey}</p> : null}
        </div>
        {selected ? <span className="reading-selected-badge">Sorteado pela roleta</span> : null}
        <label className="despertai-read-all">
          <input
            type="checkbox"
            checked={video.read}
            disabled={busy}
            onChange={(event) =>
              onPatch({
                type: toggleType,
                video_id: video.id,
                read: event.target.checked,
              })
            }
          />
          <span>Visto</span>
        </label>
      </div>
    </article>
  );
}

function ReadingSearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="reading-search-field">
      <Search size={15} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")}>
          Limpar
        </button>
      ) : null}
    </label>
  );
}

function WheelFilterField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="reading-wheel-filter-field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export default function DespertaiClient({ initialData }: DespertaiClientProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"despertai" | "videos" | "broadcasting" | "bible">("despertai");
  const [importText, setImportText] = useState("");
  const [despertaiSearch, setDespertaiSearch] = useState("");
  const [videoSearch, setVideoSearch] = useState("");
  const [broadcastingSearch, setBroadcastingSearch] = useState("");
  const [issueWheelMinYear, setIssueWheelMinYear] = useState("");
  const [issueWheelMaxYear, setIssueWheelMaxYear] = useState("");
  const [issueWheelMinTopics, setIssueWheelMinTopics] = useState("");
  const [issueWheelMaxTopics, setIssueWheelMaxTopics] = useState("");
  const [videoWheelMinMinutes, setVideoWheelMinMinutes] = useState("");
  const [videoWheelMaxMinutes, setVideoWheelMaxMinutes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(() => new Set());
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelResultIssueId, setWheelResultIssueId] = useState<string | null>(null);
  const [wheelLastIssueId, setWheelLastIssueId] = useState<string | null>(null);
  const [wheelShuffleNonce, setWheelShuffleNonce] = useState(0);
  const [pendingRevealIssueId, setPendingRevealIssueId] = useState<string | null>(null);
  const wheelSpinTimeoutRef = useRef<number | null>(null);
  const [videoWheelSpinning, setVideoWheelSpinning] = useState(false);
  const [videoWheelRotation, setVideoWheelRotation] = useState(0);
  const [videoWheelResultId, setVideoWheelResultId] = useState<string | null>(null);
  const [videoWheelLastId, setVideoWheelLastId] = useState<string | null>(null);
  const [videoWheelShuffleNonce, setVideoWheelShuffleNonce] = useState(0);
  const [pendingRevealVideoId, setPendingRevealVideoId] = useState<string | null>(null);
  const videoWheelSpinTimeoutRef = useRef<number | null>(null);
  const [broadcastingWheelSpinning, setBroadcastingWheelSpinning] = useState(false);
  const [broadcastingWheelRotation, setBroadcastingWheelRotation] = useState(0);
  const [broadcastingWheelResultId, setBroadcastingWheelResultId] = useState<string | null>(null);
  const [broadcastingWheelLastId, setBroadcastingWheelLastId] = useState<string | null>(null);
  const [broadcastingWheelShuffleNonce, setBroadcastingWheelShuffleNonce] = useState(0);
  const [pendingRevealBroadcastingId, setPendingRevealBroadcastingId] = useState<string | null>(null);
  const broadcastingWheelSpinTimeoutRef = useRef<number | null>(null);

  const readingQuery = useQuery({
    queryKey,
    queryFn: () => fetchJson<ReadingPageData>("/api/reading"),
    initialData,
  });
  const data = readingQuery.data;

  const patchMutation = useMutation({
    mutationFn: (payload: ReadingPatchPayload) =>
      fetchJson<ReadingPageData>("/api/reading", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (nextData, payload) => {
      queryClient.setQueryData(queryKey, nextData);
      if (payload.type === "import_despertai") {
        setImportText("");
        setNotice("Importado.");
      } else {
        setNotice(null);
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Falha ao salvar.";
      setNotice(message);
    },
  });

  const summary = useMemo(
    () => ({
      pending: data.despertai.pendingIssues.length,
      finished: data.despertai.finishedIssuesList.length,
    }),
    [data]
  );
  const despertaiSearchTerm = normalizeSearchText(despertaiSearch);
  const videoSearchTerm = normalizeSearchText(videoSearch);
  const broadcastingSearchTerm = normalizeSearchText(broadcastingSearch);
  const filteredPendingIssues = useMemo(() => {
    if (!despertaiSearchTerm) return data.despertai.pendingIssues;
    return data.despertai.pendingIssues.filter((issue) =>
      matchesSearchText(`${issue.title} ${issue.year} ${issue.dateLabel || ""}`, despertaiSearchTerm)
    );
  }, [data.despertai.pendingIssues, despertaiSearchTerm]);
  const filteredFinishedIssues = useMemo(() => {
    if (!despertaiSearchTerm) return data.despertai.finishedIssuesList;
    return data.despertai.finishedIssuesList.filter((issue) =>
      matchesSearchText(`${issue.title} ${issue.year} ${issue.dateLabel || ""}`, despertaiSearchTerm)
    );
  }, [data.despertai.finishedIssuesList, despertaiSearchTerm]);
  const filteredPendingVideos = useMemo(() => {
    if (!videoSearchTerm) return data.videos.pendingVideosList;
    return data.videos.pendingVideosList.filter((video) =>
      matchesSearchText(`${video.title} ${video.naturalKey || ""}`, videoSearchTerm)
    );
  }, [data.videos.pendingVideosList, videoSearchTerm]);
  const filteredFinishedVideos = useMemo(() => {
    if (!videoSearchTerm) return data.videos.finishedVideosList;
    return data.videos.finishedVideosList.filter((video) =>
      matchesSearchText(`${video.title} ${video.naturalKey || ""}`, videoSearchTerm)
    );
  }, [data.videos.finishedVideosList, videoSearchTerm]);
  const filteredPendingBroadcasting = useMemo(() => {
    if (!broadcastingSearchTerm) return data.broadcasting.pendingVideosList;
    return data.broadcasting.pendingVideosList.filter((video) =>
      matchesSearchText(`${video.title} ${video.naturalKey || ""}`, broadcastingSearchTerm)
    );
  }, [data.broadcasting.pendingVideosList, broadcastingSearchTerm]);
  const filteredFinishedBroadcasting = useMemo(() => {
    if (!broadcastingSearchTerm) return data.broadcasting.finishedVideosList;
    return data.broadcasting.finishedVideosList.filter((video) =>
      matchesSearchText(`${video.title} ${video.naturalKey || ""}`, broadcastingSearchTerm)
    );
  }, [data.broadcasting.finishedVideosList, broadcastingSearchTerm]);
  const issueWheelFilteredPool = useMemo(() => {
    const minYear = optionalPositiveNumber(issueWheelMinYear);
    const maxYear = optionalPositiveNumber(issueWheelMaxYear);
    const minTopics = optionalPositiveNumber(issueWheelMinTopics);
    const maxTopics = optionalPositiveNumber(issueWheelMaxTopics);
    return data.despertai.pendingIssues.filter((issue) => {
      if (minYear !== null && issue.year < minYear) return false;
      if (maxYear !== null && issue.year > maxYear) return false;
      if (minTopics !== null && issue.totalTopics < minTopics) return false;
      if (maxTopics !== null && issue.totalTopics > maxTopics) return false;
      return true;
    });
  }, [
    data.despertai.pendingIssues,
    issueWheelMaxTopics,
    issueWheelMaxYear,
    issueWheelMinTopics,
    issueWheelMinYear,
  ]);
  const videoWheelFilteredPool = useMemo(() => {
    const minMinutes = optionalPositiveNumber(videoWheelMinMinutes);
    const maxMinutes = optionalPositiveNumber(videoWheelMaxMinutes);
    return data.videos.pendingVideosList.filter((video) => {
      const minutes = video.durationSeconds / 60;
      if (minMinutes !== null && minutes < minMinutes) return false;
      if (maxMinutes !== null && minutes > maxMinutes) return false;
      return true;
    });
  }, [data.videos.pendingVideosList, videoWheelMaxMinutes, videoWheelMinMinutes]);
  const broadcastingWheelFilteredPool = data.broadcasting.pendingVideosList;
  const issueWheelHasFilters = Boolean(
    issueWheelMinYear || issueWheelMaxYear || issueWheelMinTopics || issueWheelMaxTopics
  );
  const videoWheelHasFilters = Boolean(videoWheelMinMinutes || videoWheelMaxMinutes);
  const wheelEligibleIssues = useMemo(() => {
    const pending = issueWheelFilteredPool;
    if (!wheelLastIssueId || pending.length <= 1) return pending;
    const filtered = pending.filter((issue) => issue.id !== wheelLastIssueId);
    return filtered.length ? filtered : pending;
  }, [issueWheelFilteredPool, wheelLastIssueId]);
  const wheelOrderedIssues = useMemo(() => {
    const sorted = [...wheelEligibleIssues].sort((a, b) => a.id.localeCompare(b.id));
    if (sorted.length <= 1) return sorted;
    const seed = hashWheelSeed(
      `${wheelShuffleNonce}:${sorted.map((issue) => issue.id).join("|")}`
    );
    return shuffleWithSeed(sorted, seed);
  }, [wheelEligibleIssues, wheelShuffleNonce]);
  const wheelSegments = useMemo<DespertaiWheelSegment[]>(() => {
    if (!wheelOrderedIssues.length) return [];
    const span = 360 / wheelOrderedIssues.length;
    return wheelOrderedIssues.map((issue, index) => {
      const startAngle = index * span;
      const endAngle = startAngle + span;
      return {
        issue,
        startAngle,
        endAngle,
        midAngle: startAngle + span / 2,
        span,
        color: DESPERTAI_WHEEL_COLORS[index % DESPERTAI_WHEEL_COLORS.length],
      };
    });
  }, [wheelOrderedIssues]);
  const wheelResultIssue = useMemo(
    () => data.despertai.pendingIssues.find((issue) => issue.id === wheelResultIssueId) || null,
    [data.despertai.pendingIssues, wheelResultIssueId]
  );
  const wheelRotorStyle = useMemo(
    () =>
      ({
        transform: `rotate(${wheelRotation}deg)`,
        transition: `transform ${DESPERTAI_WHEEL_SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.88, 0.16, 1)`,
      }) as CSSProperties,
    [wheelRotation]
  );
  const videoWheelEligibleItems = useMemo(() => {
    const pending = videoWheelFilteredPool;
    if (!videoWheelLastId || pending.length <= 1) return pending;
    const filtered = pending.filter((video) => video.id !== videoWheelLastId);
    return filtered.length ? filtered : pending;
  }, [videoWheelFilteredPool, videoWheelLastId]);
  const videoWheelOrderedItems = useMemo(() => {
    const sorted = [...videoWheelEligibleItems].sort((a, b) => a.id.localeCompare(b.id));
    if (sorted.length <= 1) return sorted;
    const seed = hashWheelSeed(
      `${videoWheelShuffleNonce}:${sorted.map((video) => video.id).join("|")}`
    );
    return shuffleWithSeed(sorted, seed);
  }, [videoWheelEligibleItems, videoWheelShuffleNonce]);
  const videoWheelSegments = useMemo<VideoWheelSegment[]>(() => {
    if (!videoWheelOrderedItems.length) return [];
    const span = 360 / videoWheelOrderedItems.length;
    return videoWheelOrderedItems.map((video, index) => {
      const startAngle = index * span;
      const endAngle = startAngle + span;
      return {
        video,
        startAngle,
        endAngle,
        midAngle: startAngle + span / 2,
        span,
        color: DESPERTAI_WHEEL_COLORS[index % DESPERTAI_WHEEL_COLORS.length],
      };
    });
  }, [videoWheelOrderedItems]);
  const videoWheelResult = useMemo(
    () => data.videos.pendingVideosList.find((video) => video.id === videoWheelResultId) || null,
    [data.videos.pendingVideosList, videoWheelResultId]
  );
  const videoWheelRotorStyle = useMemo(
    () =>
      ({
        transform: `rotate(${videoWheelRotation}deg)`,
        transition: `transform ${DESPERTAI_WHEEL_SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.88, 0.16, 1)`,
      }) as CSSProperties,
    [videoWheelRotation]
  );
  const broadcastingWheelEligibleItems = useMemo(() => {
    const pending = broadcastingWheelFilteredPool;
    if (!broadcastingWheelLastId || pending.length <= 1) return pending;
    const filtered = pending.filter((video) => video.id !== broadcastingWheelLastId);
    return filtered.length ? filtered : pending;
  }, [broadcastingWheelFilteredPool, broadcastingWheelLastId]);
  const broadcastingWheelOrderedItems = useMemo(() => {
    const sorted = [...broadcastingWheelEligibleItems].sort((a, b) => a.id.localeCompare(b.id));
    if (sorted.length <= 1) return sorted;
    const seed = hashWheelSeed(
      `${broadcastingWheelShuffleNonce}:${sorted.map((video) => video.id).join("|")}`
    );
    return shuffleWithSeed(sorted, seed);
  }, [broadcastingWheelEligibleItems, broadcastingWheelShuffleNonce]);
  const broadcastingWheelSegments = useMemo<VideoWheelSegment[]>(() => {
    if (!broadcastingWheelOrderedItems.length) return [];
    const span = 360 / broadcastingWheelOrderedItems.length;
    return broadcastingWheelOrderedItems.map((video, index) => {
      const startAngle = index * span;
      const endAngle = startAngle + span;
      return {
        video,
        startAngle,
        endAngle,
        midAngle: startAngle + span / 2,
        span,
        color: DESPERTAI_WHEEL_COLORS[index % DESPERTAI_WHEEL_COLORS.length],
      };
    });
  }, [broadcastingWheelOrderedItems]);
  const broadcastingWheelResult = useMemo(
    () => data.broadcasting.pendingVideosList.find((video) => video.id === broadcastingWheelResultId) || null,
    [data.broadcasting.pendingVideosList, broadcastingWheelResultId]
  );
  const broadcastingWheelRotorStyle = useMemo(
    () =>
      ({
        transform: `rotate(${broadcastingWheelRotation}deg)`,
        transition: `transform ${DESPERTAI_WHEEL_SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.88, 0.16, 1)`,
      }) as CSSProperties,
    [broadcastingWheelRotation]
  );

  useEffect(() => {
    if (wheelResultIssueId && !issueWheelFilteredPool.some((issue) => issue.id === wheelResultIssueId)) {
      setWheelResultIssueId(null);
    }
  }, [issueWheelFilteredPool, wheelResultIssueId]);

  useEffect(() => {
    if (videoWheelResultId && !videoWheelFilteredPool.some((video) => video.id === videoWheelResultId)) {
      setVideoWheelResultId(null);
    }
  }, [videoWheelFilteredPool, videoWheelResultId]);

  useEffect(() => {
    if (
      broadcastingWheelResultId &&
      !broadcastingWheelFilteredPool.some((video) => video.id === broadcastingWheelResultId)
    ) {
      setBroadcastingWheelResultId(null);
    }
  }, [broadcastingWheelFilteredPool, broadcastingWheelResultId]);

  useEffect(() => {
    return () => {
      if (wheelSpinTimeoutRef.current) {
        window.clearTimeout(wheelSpinTimeoutRef.current);
      }
      if (videoWheelSpinTimeoutRef.current) {
        window.clearTimeout(videoWheelSpinTimeoutRef.current);
      }
      if (broadcastingWheelSpinTimeoutRef.current) {
        window.clearTimeout(broadcastingWheelSpinTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingRevealIssueId || activeTab !== "despertai" || !expandedIssues.has(pendingRevealIssueId)) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const target = document.getElementById(issueElementId(pendingRevealIssueId));
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setPendingRevealIssueId(null);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [activeTab, expandedIssues, pendingRevealIssueId]);

  useEffect(() => {
    if (!pendingRevealVideoId || activeTab !== "videos") {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const target = document.getElementById(videoElementId(pendingRevealVideoId));
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setPendingRevealVideoId(null);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [activeTab, pendingRevealVideoId]);

  useEffect(() => {
    if (!pendingRevealBroadcastingId || activeTab !== "broadcasting") {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const target = document.getElementById(broadcastingElementId(pendingRevealBroadcastingId));
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setPendingRevealBroadcastingId(null);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [activeTab, pendingRevealBroadcastingId]);

  const patch = (payload: ReadingPatchPayload) => {
    patchMutation.mutate(payload);
  };

  const toggleExpandedIssue = (issueId: string) => {
    setExpandedIssues((current) => {
      const next = new Set(current);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  const revealIssueFromWheel = (issueId: string) => {
    setActiveTab("despertai");
    setExpandedIssues((current) => new Set(current).add(issueId));
    setPendingRevealIssueId(issueId);
  };

  const spinDespertaiWheel = () => {
    if (wheelSpinning || !wheelSegments.length) return;
    if (wheelSegments.length === 1) {
      const onlyIssue = wheelSegments[0].issue;
      setWheelResultIssueId(onlyIssue.id);
      setWheelLastIssueId(onlyIssue.id);
      revealIssueFromWheel(onlyIssue.id);
      return;
    }

    const selectedSegment = wheelSegments[Math.floor(Math.random() * wheelSegments.length)];
    const safeMargin = Math.min(10, selectedSegment.span * 0.2);
    const minStop = selectedSegment.startAngle + safeMargin;
    const maxStop = selectedSegment.endAngle - safeMargin;
    const stopAngle =
      maxStop > minStop
        ? minStop + Math.random() * (maxStop - minStop)
        : selectedSegment.midAngle;
    const currentRotation = ((wheelRotation % 360) + 360) % 360;
    const targetRotationMod = (360 - stopAngle + 360) % 360;
    let delta = targetRotationMod - currentRotation;
    if (delta < 0) delta += 360;
    const finalRotation = wheelRotation + 1800 + delta;

    setWheelResultIssueId(null);
    setWheelSpinning(true);
    setWheelRotation(finalRotation);
    if (wheelSpinTimeoutRef.current) {
      window.clearTimeout(wheelSpinTimeoutRef.current);
    }
    wheelSpinTimeoutRef.current = window.setTimeout(() => {
      const resultSegment = findWheelSegmentAtPointer(wheelSegments, finalRotation);
      const resultIssueId = resultSegment?.issue.id || selectedSegment.issue.id;
      setWheelResultIssueId(resultIssueId);
      setWheelLastIssueId(resultIssueId);
      setWheelSpinning(false);
      revealIssueFromWheel(resultIssueId);
    }, DESPERTAI_WHEEL_SPIN_DURATION_MS);
  };

  const shuffleDespertaiWheel = () => {
    if (wheelSpinning) return;
    setWheelShuffleNonce((current) => current + 1);
    setWheelResultIssueId(null);
    setWheelRotation((current) => current + 45 + Math.floor(Math.random() * 150));
  };

  const openWheelIssueTopics = () => {
    if (!wheelResultIssue) return;
    revealIssueFromWheel(wheelResultIssue.id);
  };

  const revealVideoFromWheel = (videoId: string) => {
    setActiveTab("videos");
    setVideoSearch("");
    setPendingRevealVideoId(videoId);
  };

  const spinVideoWheel = () => {
    if (videoWheelSpinning || !videoWheelSegments.length) return;
    if (videoWheelSegments.length === 1) {
      const onlyVideo = videoWheelSegments[0].video;
      setVideoWheelResultId(onlyVideo.id);
      setVideoWheelLastId(onlyVideo.id);
      revealVideoFromWheel(onlyVideo.id);
      return;
    }

    const selectedSegment = videoWheelSegments[Math.floor(Math.random() * videoWheelSegments.length)];
    const safeMargin = Math.min(10, selectedSegment.span * 0.2);
    const minStop = selectedSegment.startAngle + safeMargin;
    const maxStop = selectedSegment.endAngle - safeMargin;
    const stopAngle =
      maxStop > minStop
        ? minStop + Math.random() * (maxStop - minStop)
        : selectedSegment.midAngle;
    const currentRotation = ((videoWheelRotation % 360) + 360) % 360;
    const targetRotationMod = (360 - stopAngle + 360) % 360;
    let delta = targetRotationMod - currentRotation;
    if (delta < 0) delta += 360;
    const finalRotation = videoWheelRotation + 1800 + delta;

    setVideoWheelResultId(null);
    setVideoWheelSpinning(true);
    setVideoWheelRotation(finalRotation);
    if (videoWheelSpinTimeoutRef.current) {
      window.clearTimeout(videoWheelSpinTimeoutRef.current);
    }
    videoWheelSpinTimeoutRef.current = window.setTimeout(() => {
      const resultSegment = findWheelSegmentAtPointer(videoWheelSegments, finalRotation);
      const resultVideoId = resultSegment?.video.id || selectedSegment.video.id;
      setVideoWheelResultId(resultVideoId);
      setVideoWheelLastId(resultVideoId);
      setVideoWheelSpinning(false);
      revealVideoFromWheel(resultVideoId);
    }, DESPERTAI_WHEEL_SPIN_DURATION_MS);
  };

  const shuffleVideoWheel = () => {
    if (videoWheelSpinning) return;
    setVideoWheelShuffleNonce((current) => current + 1);
    setVideoWheelResultId(null);
    setVideoWheelRotation((current) => current + 45 + Math.floor(Math.random() * 150));
  };

  const revealBroadcastingFromWheel = (videoId: string) => {
    setActiveTab("broadcasting");
    setBroadcastingSearch("");
    setPendingRevealBroadcastingId(videoId);
  };

  const spinBroadcastingWheel = () => {
    if (broadcastingWheelSpinning || !broadcastingWheelSegments.length) return;
    if (broadcastingWheelSegments.length === 1) {
      const onlyVideo = broadcastingWheelSegments[0].video;
      setBroadcastingWheelResultId(onlyVideo.id);
      setBroadcastingWheelLastId(onlyVideo.id);
      revealBroadcastingFromWheel(onlyVideo.id);
      return;
    }

    const selectedSegment = broadcastingWheelSegments[Math.floor(Math.random() * broadcastingWheelSegments.length)];
    const safeMargin = Math.min(10, selectedSegment.span * 0.2);
    const minStop = selectedSegment.startAngle + safeMargin;
    const maxStop = selectedSegment.endAngle - safeMargin;
    const stopAngle =
      maxStop > minStop
        ? minStop + Math.random() * (maxStop - minStop)
        : selectedSegment.midAngle;
    const currentRotation = ((broadcastingWheelRotation % 360) + 360) % 360;
    const targetRotationMod = (360 - stopAngle + 360) % 360;
    let delta = targetRotationMod - currentRotation;
    if (delta < 0) delta += 360;
    const finalRotation = broadcastingWheelRotation + 1800 + delta;

    setBroadcastingWheelResultId(null);
    setBroadcastingWheelSpinning(true);
    setBroadcastingWheelRotation(finalRotation);
    if (broadcastingWheelSpinTimeoutRef.current) {
      window.clearTimeout(broadcastingWheelSpinTimeoutRef.current);
    }
    broadcastingWheelSpinTimeoutRef.current = window.setTimeout(() => {
      const resultSegment = findWheelSegmentAtPointer(broadcastingWheelSegments, finalRotation);
      const resultVideoId = resultSegment?.video.id || selectedSegment.video.id;
      setBroadcastingWheelResultId(resultVideoId);
      setBroadcastingWheelLastId(resultVideoId);
      setBroadcastingWheelSpinning(false);
      revealBroadcastingFromWheel(resultVideoId);
    }, DESPERTAI_WHEEL_SPIN_DURATION_MS);
  };

  const shuffleBroadcastingWheel = () => {
    if (broadcastingWheelSpinning) return;
    setBroadcastingWheelShuffleNonce((current) => current + 1);
    setBroadcastingWheelResultId(null);
    setBroadcastingWheelRotation((current) => current + 45 + Math.floor(Math.random() * 150));
  };

  return (
    <div className="card despertai-shell">
      <div className="despertai-tabs" role="tablist" aria-label="Reading sections">
        <button
          type="button"
          className={activeTab === "despertai" ? "active" : ""}
          onClick={() => setActiveTab("despertai")}
        >
          Despertai
        </button>
        <button
          type="button"
          className={activeTab === "videos" ? "active" : ""}
          onClick={() => setActiveTab("videos")}
        >
          Vídeos
        </button>
        <button
          type="button"
          className={activeTab === "broadcasting" ? "active" : ""}
          onClick={() => setActiveTab("broadcasting")}
        >
          Broadcasting
        </button>
        <button
          type="button"
          className={activeTab === "bible" ? "active" : ""}
          onClick={() => setActiveTab("bible")}
        >
          Bíblia
        </button>
      </div>

      {notice ? <InlineActionNotice body={notice} tone={patchMutation.isError ? "error" : "default"} /> : null}
      {readingQuery.isError ? (
        <InlineActionNotice
          tone="error"
          body="Não foi possível carregar."
          actionLabel="Retry"
          onAction={() => void readingQuery.refetch()}
        />
      ) : null}

      {activeTab === "despertai" ? (
        <section className="despertai-tab-panel">
          <div className="reading-summary-grid">
            <article className="reading-summary-card main">
              <ProgressDonut value={data.despertai.progressPercent} label="geral" />
              <div>
                <p className="panel-kicker">Despertai</p>
                <h3>{data.despertai.readTopics}/{data.despertai.totalTopics} tópicos</h3>
              </div>
            </article>
            <article className="reading-summary-card">
              <span>Não lidas</span>
              <strong>{summary.pending}</strong>
            </article>
            <article className="reading-summary-card">
              <span>Lidas</span>
              <strong>{summary.finished}</strong>
            </article>
          </div>

          <section className="despertai-wheel-card">
            <div className="activity-wheel-head">
              <div>
                <p className="panel-kicker">Roleta</p>
                <h3>Despertai</h3>
                <p className="activity-wheel-copy">Clique no centro para sortear.</p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={shuffleDespertaiWheel}
                disabled={wheelSpinning || wheelOrderedIssues.length <= 1}
              >
                Embaralhar
              </button>
            </div>

            <div className="activity-wheel-controls">
              <span className="activity-wheel-meta">
                {wheelEligibleIssues.length} revistas
              </span>
            </div>

            <div className="reading-wheel-filters" aria-label="Filtros da roleta Despertai">
              <span className="reading-wheel-filter-label">Filtros opcionais</span>
              <WheelFilterField
                label="Ano mín."
                value={issueWheelMinYear}
                onChange={setIssueWheelMinYear}
                placeholder="1970"
              />
              <WheelFilterField
                label="Ano máx."
                value={issueWheelMaxYear}
                onChange={setIssueWheelMaxYear}
                placeholder="2026"
              />
              <WheelFilterField
                label="Tópicos mín."
                value={issueWheelMinTopics}
                onChange={setIssueWheelMinTopics}
                placeholder="0"
              />
              <WheelFilterField
                label="Tópicos máx."
                value={issueWheelMaxTopics}
                onChange={setIssueWheelMaxTopics}
                placeholder="20"
              />
              {issueWheelHasFilters ? (
                <button
                  type="button"
                  className="page-link inline muted"
                  onClick={() => {
                    setIssueWheelMinYear("");
                    setIssueWheelMaxYear("");
                    setIssueWheelMinTopics("");
                    setIssueWheelMaxTopics("");
                  }}
                >
                  Sem restrições
                </button>
              ) : null}
            </div>

            <div className="activity-wheel-stage">
              <div className={`activity-wheel-dial-wrap ${wheelSpinning ? "spinning" : ""}`}>
                <span className="activity-wheel-pointer" aria-hidden="true" />
                <div className="activity-wheel-dial-shell">
                  <svg
                    className="activity-wheel-dial"
                    viewBox="0 0 260 260"
                    role="img"
                    aria-label="Roleta de revistas Despertai não lidas"
                  >
                    <g
                      className={`activity-wheel-rotor ${wheelSpinning ? "spinning" : ""}`}
                      style={wheelRotorStyle}
                    >
                      {wheelSegments.map((segment) => {
                        const labelPoint = polar(
                          DESPERTAI_WHEEL_CENTER,
                          DESPERTAI_WHEEL_CENTER,
                          DESPERTAI_WHEEL_LABEL_RADIUS,
                          segment.midAngle
                        );
                        const labelMaxLength =
                          segment.span >= 72 ? 11 : segment.span >= 45 ? 9 : 8;
                        const label = truncateWheelLabel(segment.issue.title, labelMaxLength);
                        const canRenderLabel = segment.span >= 24;

                        return (
                          <g key={segment.issue.id}>
                            <path
                              d={describeWheelSlice(
                                DESPERTAI_WHEEL_CENTER,
                                DESPERTAI_WHEEL_CENTER,
                                DESPERTAI_WHEEL_RADIUS,
                                segment.startAngle,
                                segment.endAngle
                              )}
                              className={`activity-wheel-slice ${
                                !wheelSpinning && segment.issue.id === wheelResultIssueId
                                  ? "is-result"
                                  : ""
                              }`}
                              style={{ fill: segment.color }}
                            >
                              <title>{segment.issue.title}</title>
                            </path>
                            {canRenderLabel ? (
                              <text
                                x={labelPoint.x}
                                y={labelPoint.y}
                                className="activity-wheel-slice-label"
                                dominantBaseline="middle"
                                textAnchor="middle"
                              >
                                {label}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                      <circle
                        cx={DESPERTAI_WHEEL_CENTER}
                        cy={DESPERTAI_WHEEL_CENTER}
                        r={DESPERTAI_WHEEL_RADIUS}
                        className="activity-wheel-rim"
                      />
                    </g>
                    <circle
                      cx={DESPERTAI_WHEEL_CENTER}
                      cy={DESPERTAI_WHEEL_CENTER}
                      r="31"
                      className="activity-wheel-hub"
                    />
                    <circle
                      cx={DESPERTAI_WHEEL_CENTER}
                      cy={DESPERTAI_WHEEL_CENTER}
                      r="6"
                      className="activity-wheel-hub-dot"
                    />
                  </svg>
                  <button
                    type="button"
                    className="activity-wheel-hub-button"
                    onClick={spinDespertaiWheel}
                    disabled={wheelSpinning || wheelEligibleIssues.length === 0}
                    aria-label={
                      wheelSpinning
                        ? "Roleta girando"
                        : wheelEligibleIssues.length === 0
                          ? "Nenhuma revista pendente"
                          : "Sortear revista Despertai"
                    }
                  >
                    {wheelSpinning ? "..." : "Girar"}
                  </button>
                </div>
              </div>

              <div className="activity-wheel-result despertai-wheel-result">
                {wheelEligibleIssues.length === 0 ? (
                  <p className="line-empty">
                    {issueWheelHasFilters ? "Nenhuma revista nesses filtros." : "Nenhuma revista pendente."}
                  </p>
                ) : wheelResultIssue ? (
                  <article className="activity-wheel-result-card despertai-wheel-result-card">
                    <strong>{wheelResultIssue.title}</strong>
                    <p>
                      {wheelResultIssue.year}
                      {wheelResultIssue.dateLabel ? ` · ${wheelResultIssue.dateLabel}` : ""}
                      {` · ${wheelResultIssue.readCount}/${wheelResultIssue.totalTopics} tópicos`}
                    </p>
                    <div className="activity-wheel-result-actions">
                      <button type="button" className="secondary" onClick={openWheelIssueTopics}>
                        Ver tópicos
                      </button>
                      <button
                        type="button"
                        className="page-link inline muted"
                        onClick={spinDespertaiWheel}
                        disabled={wheelSpinning}
                      >
                        Sortear de novo
                      </button>
                    </div>
                  </article>
                ) : (
                  <article className="activity-wheel-summary-card">
                    <p className="activity-wheel-summary-title">Na roleta</p>
                    <ul className="activity-wheel-task-list">
                      {wheelOrderedIssues.slice(0, 8).map((issue) => (
                        <li key={issue.id} title={issue.title}>
                          <span>{truncateWheelLabel(issue.title, 30)}</span>
                          <small>{issue.year}</small>
                        </li>
                      ))}
                    </ul>
                    {wheelOrderedIssues.length > 8 ? (
                      <p className="activity-wheel-more">+{wheelOrderedIssues.length - 8} mais</p>
                    ) : null}
                    <p className="activity-wheel-tip">O nome completo aparece depois do sorteio.</p>
                  </article>
                )}
              </div>
            </div>
          </section>

          <details className="despertai-import-card">
            <summary>Importar tabela</summary>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Ano, data, título, tópicos&#10;2026, Janeiro, Tema da revista, Artigo 1; Artigo 2"
            />
            <button
              type="button"
              className="page-link primary"
              disabled={!importText.trim() || patchMutation.isPending}
              onClick={() => patch({ type: "import_despertai", raw: importText })}
            >
              Importar
            </button>
          </details>

          <ReadingSearchField
            value={despertaiSearch}
            onChange={setDespertaiSearch}
            placeholder="Buscar revista"
          />

          <section className="despertai-list-section">
            <div className="despertai-section-title">
              <h3>Não lidas</h3>
              <span>{despertaiSearchTerm ? filteredPendingIssues.length : "recentes primeiro"}</span>
            </div>
            {filteredPendingIssues.length ? (
              <div className="despertai-issue-list">
                {filteredPendingIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    busy={patchMutation.isPending}
                    onPatch={patch}
                    expanded={expandedIssues.has(issue.id)}
                    onToggleExpanded={toggleExpandedIssue}
                    selected={wheelResultIssueId === issue.id}
                  />
                ))}
              </div>
            ) : despertaiSearchTerm ? (
              <div className="line-empty">Nenhuma revista encontrada.</div>
            ) : (
              <div className="line-empty">Cole sua tabela para começar.</div>
            )}
          </section>

          <section className="despertai-list-section">
            <div className="despertai-section-title">
              <h3>Lidas</h3>
              <span>{filteredFinishedIssues.length}</span>
            </div>
            {filteredFinishedIssues.length ? (
              <div className="despertai-finished-list">
                {filteredFinishedIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    busy={patchMutation.isPending}
                    onPatch={patch}
                    expanded={expandedIssues.has(issue.id)}
                    onToggleExpanded={toggleExpandedIssue}
                    selected={wheelResultIssueId === issue.id}
                  />
                ))}
              </div>
            ) : despertaiSearchTerm ? (
              <div className="line-empty">Nenhuma revista encontrada.</div>
            ) : (
              <div className="line-empty">Nenhuma revista concluída.</div>
            )}
          </section>
        </section>
      ) : activeTab === "videos" ? (
        <section className="despertai-tab-panel">
          <div className="reading-summary-grid">
            <article className="reading-summary-card main">
              <ProgressDonut value={data.videos.progressPercent} label="vídeos" />
              <div>
                <p className="panel-kicker">Vídeos</p>
                <h3>{data.videos.finishedVideos}/{data.videos.totalVideos} vistos</h3>
              </div>
            </article>
            <article className="reading-summary-card">
              <span>Pendentes</span>
              <strong>{data.videos.pendingVideos}</strong>
            </article>
            <article className="reading-summary-card">
              <span>Tempo visto</span>
              <strong>{formatDuration(data.videos.watchedDurationSeconds)}</strong>
            </article>
          </div>

          <section className="despertai-wheel-card">
            <div className="activity-wheel-head">
              <div>
                <p className="panel-kicker">Roleta</p>
                <h3>Vídeos</h3>
                <p className="activity-wheel-copy">Clique no centro para sortear.</p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={shuffleVideoWheel}
                disabled={videoWheelSpinning || videoWheelOrderedItems.length <= 1}
              >
                Embaralhar
              </button>
            </div>

            <div className="activity-wheel-controls">
              <span className="activity-wheel-meta">
                {videoWheelEligibleItems.length} vídeos
              </span>
            </div>

            <div className="reading-wheel-filters" aria-label="Filtros da roleta de vídeos">
              <span className="reading-wheel-filter-label">Filtros opcionais</span>
              <WheelFilterField
                label="Minutos mín."
                value={videoWheelMinMinutes}
                onChange={setVideoWheelMinMinutes}
                placeholder="0"
              />
              <WheelFilterField
                label="Minutos máx."
                value={videoWheelMaxMinutes}
                onChange={setVideoWheelMaxMinutes}
                placeholder="30"
              />
              {videoWheelHasFilters ? (
                <button
                  type="button"
                  className="page-link inline muted"
                  onClick={() => {
                    setVideoWheelMinMinutes("");
                    setVideoWheelMaxMinutes("");
                  }}
                >
                  Sem restrições
                </button>
              ) : null}
            </div>

            <div className="activity-wheel-stage">
              <div className={`activity-wheel-dial-wrap ${videoWheelSpinning ? "spinning" : ""}`}>
                <span className="activity-wheel-pointer" aria-hidden="true" />
                <div className="activity-wheel-dial-shell">
                  <svg
                    className="activity-wheel-dial"
                    viewBox="0 0 260 260"
                    role="img"
                    aria-label="Roleta de vídeos não vistos"
                  >
                    <g
                      className={`activity-wheel-rotor ${videoWheelSpinning ? "spinning" : ""}`}
                      style={videoWheelRotorStyle}
                    >
                      {videoWheelSegments.map((segment) => {
                        const labelPoint = polar(
                          DESPERTAI_WHEEL_CENTER,
                          DESPERTAI_WHEEL_CENTER,
                          DESPERTAI_WHEEL_LABEL_RADIUS,
                          segment.midAngle
                        );
                        const labelMaxLength =
                          segment.span >= 72 ? 11 : segment.span >= 45 ? 9 : 8;
                        const label = truncateWheelLabel(segment.video.title, labelMaxLength);
                        const canRenderLabel = segment.span >= 24;

                        return (
                          <g key={segment.video.id}>
                            <path
                              d={describeWheelSlice(
                                DESPERTAI_WHEEL_CENTER,
                                DESPERTAI_WHEEL_CENTER,
                                DESPERTAI_WHEEL_RADIUS,
                                segment.startAngle,
                                segment.endAngle
                              )}
                              className={`activity-wheel-slice ${
                                !videoWheelSpinning && segment.video.id === videoWheelResultId
                                  ? "is-result"
                                  : ""
                              }`}
                              style={{ fill: segment.color }}
                            >
                              <title>{segment.video.title}</title>
                            </path>
                            {canRenderLabel ? (
                              <text
                                x={labelPoint.x}
                                y={labelPoint.y}
                                className="activity-wheel-slice-label"
                                dominantBaseline="middle"
                                textAnchor="middle"
                              >
                                {label}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                      <circle
                        cx={DESPERTAI_WHEEL_CENTER}
                        cy={DESPERTAI_WHEEL_CENTER}
                        r={DESPERTAI_WHEEL_RADIUS}
                        className="activity-wheel-rim"
                      />
                    </g>
                    <circle
                      cx={DESPERTAI_WHEEL_CENTER}
                      cy={DESPERTAI_WHEEL_CENTER}
                      r="31"
                      className="activity-wheel-hub"
                    />
                    <circle
                      cx={DESPERTAI_WHEEL_CENTER}
                      cy={DESPERTAI_WHEEL_CENTER}
                      r="6"
                      className="activity-wheel-hub-dot"
                    />
                  </svg>
                  <button
                    type="button"
                    className="activity-wheel-hub-button"
                    onClick={spinVideoWheel}
                    disabled={videoWheelSpinning || videoWheelEligibleItems.length === 0}
                    aria-label={
                      videoWheelSpinning
                        ? "Roleta girando"
                        : videoWheelEligibleItems.length === 0
                          ? "Nenhum vídeo pendente"
                          : "Sortear vídeo"
                    }
                  >
                    {videoWheelSpinning ? "..." : "Girar"}
                  </button>
                </div>
              </div>

              <div className="activity-wheel-result despertai-wheel-result">
                {videoWheelEligibleItems.length === 0 ? (
                  <p className="line-empty">
                    {videoWheelHasFilters ? "Nenhum vídeo nesses filtros." : "Nenhum vídeo pendente."}
                  </p>
                ) : videoWheelResult ? (
                  <article className="activity-wheel-result-card despertai-wheel-result-card">
                    <strong>{videoWheelResult.title}</strong>
                    <p>{formatDuration(videoWheelResult.durationSeconds)}</p>
                    <div className="activity-wheel-result-actions">
                      <button type="button" className="secondary" onClick={() => revealVideoFromWheel(videoWheelResult.id)}>
                        Ver
                      </button>
                      <button
                        type="button"
                        className="page-link inline muted"
                        onClick={spinVideoWheel}
                        disabled={videoWheelSpinning}
                      >
                        Sortear de novo
                      </button>
                    </div>
                  </article>
                ) : (
                  <article className="activity-wheel-summary-card">
                    <p className="activity-wheel-summary-title">Na roleta</p>
                    <ul className="activity-wheel-task-list">
                      {videoWheelOrderedItems.slice(0, 8).map((video) => (
                        <li key={video.id} title={video.title}>
                          <span>{truncateWheelLabel(video.title, 30)}</span>
                          <small>{formatDuration(video.durationSeconds)}</small>
                        </li>
                      ))}
                    </ul>
                    {videoWheelOrderedItems.length > 8 ? (
                      <p className="activity-wheel-more">+{videoWheelOrderedItems.length - 8} mais</p>
                    ) : null}
                    <p className="activity-wheel-tip">O nome completo aparece depois do sorteio.</p>
                  </article>
                )}
              </div>
            </div>
          </section>

          <ReadingSearchField
            value={videoSearch}
            onChange={setVideoSearch}
            placeholder="Buscar vídeo"
          />

          {videoWheelResult ? (
            <article className="reading-selected-callout">
              <span>Sorteado</span>
              <strong>{videoWheelResult.title}</strong>
              <button type="button" className="page-link inline muted" onClick={() => revealVideoFromWheel(videoWheelResult.id)}>
                Ver na lista
              </button>
            </article>
          ) : null}

          <section className="despertai-list-section">
            <div className="despertai-section-title">
              <h3>Não vistos</h3>
              <span>{filteredPendingVideos.length}</span>
            </div>
            {filteredPendingVideos.length ? (
              <div className="reading-video-list">
                {filteredPendingVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    busy={patchMutation.isPending}
                    onPatch={patch}
                    selected={videoWheelResultId === video.id}
                    elementId={videoElementId(video.id)}
                    toggleType="toggle_reading_video"
                  />
                ))}
              </div>
            ) : videoSearchTerm ? (
              <div className="line-empty">Nenhum vídeo encontrado.</div>
            ) : (
              <div className="line-empty">Todos os vídeos foram vistos.</div>
            )}
          </section>

          <section className="despertai-list-section">
            <div className="despertai-section-title">
              <h3>Vistos</h3>
              <span>{filteredFinishedVideos.length}</span>
            </div>
            {filteredFinishedVideos.length ? (
              <div className="reading-video-list reading-video-finished-list">
                {filteredFinishedVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    busy={patchMutation.isPending}
                    onPatch={patch}
                    selected={videoWheelResultId === video.id}
                    elementId={videoElementId(video.id)}
                    toggleType="toggle_reading_video"
                  />
                ))}
              </div>
            ) : videoSearchTerm ? (
              <div className="line-empty">Nenhum vídeo encontrado.</div>
            ) : (
              <div className="line-empty">Nenhum vídeo visto ainda.</div>
            )}
          </section>
        </section>
      ) : activeTab === "broadcasting" ? (
        <section className="despertai-tab-panel">
          <div className="reading-summary-grid">
            <article className="reading-summary-card main">
              <ProgressDonut value={data.broadcasting.progressPercent} label="broadcasting" />
              <div>
                <p className="panel-kicker">Broadcasting</p>
                <h3>{data.broadcasting.finishedVideos}/{data.broadcasting.totalVideos} vistos</h3>
              </div>
            </article>
            <article className="reading-summary-card">
              <span>Pendentes</span>
              <strong>{data.broadcasting.pendingVideos}</strong>
            </article>
            <article className="reading-summary-card">
              <span>Fonte</span>
              <strong>Studio</strong>
            </article>
          </div>

          <section className="despertai-wheel-card">
            <div className="activity-wheel-head">
              <div>
                <p className="panel-kicker">Roleta</p>
                <h3>Broadcasting</h3>
                <p className="activity-wheel-copy">Clique no centro para sortear.</p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={shuffleBroadcastingWheel}
                disabled={broadcastingWheelSpinning || broadcastingWheelOrderedItems.length <= 1}
              >
                Embaralhar
              </button>
            </div>

            <div className="activity-wheel-controls">
              <span className="activity-wheel-meta">
                {broadcastingWheelEligibleItems.length} programas
              </span>
            </div>

            <div className="activity-wheel-stage">
              <div className={`activity-wheel-dial-wrap ${broadcastingWheelSpinning ? "spinning" : ""}`}>
                <span className="activity-wheel-pointer" aria-hidden="true" />
                <div className="activity-wheel-dial-shell">
                  <svg
                    className="activity-wheel-dial"
                    viewBox="0 0 260 260"
                    role="img"
                    aria-label="Roleta de programas Broadcasting não vistos"
                  >
                    <g
                      className={`activity-wheel-rotor ${broadcastingWheelSpinning ? "spinning" : ""}`}
                      style={broadcastingWheelRotorStyle}
                    >
                      {broadcastingWheelSegments.map((segment) => {
                        const labelPoint = polar(
                          DESPERTAI_WHEEL_CENTER,
                          DESPERTAI_WHEEL_CENTER,
                          DESPERTAI_WHEEL_LABEL_RADIUS,
                          segment.midAngle
                        );
                        const labelMaxLength =
                          segment.span >= 72 ? 11 : segment.span >= 45 ? 9 : 8;
                        const label = truncateWheelLabel(segment.video.title, labelMaxLength);
                        const canRenderLabel = segment.span >= 24;

                        return (
                          <g key={segment.video.id}>
                            <path
                              d={describeWheelSlice(
                                DESPERTAI_WHEEL_CENTER,
                                DESPERTAI_WHEEL_CENTER,
                                DESPERTAI_WHEEL_RADIUS,
                                segment.startAngle,
                                segment.endAngle
                              )}
                              className={`activity-wheel-slice ${
                                !broadcastingWheelSpinning && segment.video.id === broadcastingWheelResultId
                                  ? "is-result"
                                  : ""
                              }`}
                              style={{ fill: segment.color }}
                            >
                              <title>{segment.video.title}</title>
                            </path>
                            {canRenderLabel ? (
                              <text
                                x={labelPoint.x}
                                y={labelPoint.y}
                                className="activity-wheel-slice-label"
                                dominantBaseline="middle"
                                textAnchor="middle"
                              >
                                {label}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                      <circle
                        cx={DESPERTAI_WHEEL_CENTER}
                        cy={DESPERTAI_WHEEL_CENTER}
                        r={DESPERTAI_WHEEL_RADIUS}
                        className="activity-wheel-rim"
                      />
                    </g>
                    <circle
                      cx={DESPERTAI_WHEEL_CENTER}
                      cy={DESPERTAI_WHEEL_CENTER}
                      r="31"
                      className="activity-wheel-hub"
                    />
                    <circle
                      cx={DESPERTAI_WHEEL_CENTER}
                      cy={DESPERTAI_WHEEL_CENTER}
                      r="6"
                      className="activity-wheel-hub-dot"
                    />
                  </svg>
                  <button
                    type="button"
                    className="activity-wheel-hub-button"
                    onClick={spinBroadcastingWheel}
                    disabled={broadcastingWheelSpinning || broadcastingWheelEligibleItems.length === 0}
                    aria-label={
                      broadcastingWheelSpinning
                        ? "Roleta girando"
                        : broadcastingWheelEligibleItems.length === 0
                          ? "Nenhum Broadcasting pendente"
                          : "Sortear Broadcasting"
                    }
                  >
                    {broadcastingWheelSpinning ? "..." : "Girar"}
                  </button>
                </div>
              </div>

              <div className="activity-wheel-result despertai-wheel-result">
                {broadcastingWheelEligibleItems.length === 0 ? (
                  <p className="line-empty">Nenhum Broadcasting pendente.</p>
                ) : broadcastingWheelResult ? (
                  <article className="activity-wheel-result-card despertai-wheel-result-card">
                    <strong>{broadcastingWheelResult.title}</strong>
                    <p>Programa mensal</p>
                    <div className="activity-wheel-result-actions">
                      <button type="button" className="secondary" onClick={() => revealBroadcastingFromWheel(broadcastingWheelResult.id)}>
                        Ver
                      </button>
                      <button
                        type="button"
                        className="page-link inline muted"
                        onClick={spinBroadcastingWheel}
                        disabled={broadcastingWheelSpinning}
                      >
                        Sortear de novo
                      </button>
                    </div>
                  </article>
                ) : (
                  <article className="activity-wheel-summary-card">
                    <p className="activity-wheel-summary-title">Na roleta</p>
                    <ul className="activity-wheel-task-list">
                      {broadcastingWheelOrderedItems.slice(0, 8).map((video) => (
                        <li key={video.id} title={video.title}>
                          <span>{truncateWheelLabel(video.title, 30)}</span>
                          <small>Broadcasting</small>
                        </li>
                      ))}
                    </ul>
                    {broadcastingWheelOrderedItems.length > 8 ? (
                      <p className="activity-wheel-more">+{broadcastingWheelOrderedItems.length - 8} mais</p>
                    ) : null}
                    <p className="activity-wheel-tip">O nome completo aparece depois do sorteio.</p>
                  </article>
                )}
              </div>
            </div>
          </section>

          <ReadingSearchField
            value={broadcastingSearch}
            onChange={setBroadcastingSearch}
            placeholder="Buscar Broadcasting"
          />

          {broadcastingWheelResult ? (
            <article className="reading-selected-callout">
              <span>Sorteado</span>
              <strong>{broadcastingWheelResult.title}</strong>
              <button type="button" className="page-link inline muted" onClick={() => revealBroadcastingFromWheel(broadcastingWheelResult.id)}>
                Ver na lista
              </button>
            </article>
          ) : null}

          <section className="despertai-list-section">
            <div className="despertai-section-title">
              <h3>Não vistos</h3>
              <span>{filteredPendingBroadcasting.length}</span>
            </div>
            {filteredPendingBroadcasting.length ? (
              <div className="reading-video-list">
                {filteredPendingBroadcasting.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    busy={patchMutation.isPending}
                    onPatch={patch}
                    selected={broadcastingWheelResultId === video.id}
                    elementId={broadcastingElementId(video.id)}
                    toggleType="toggle_broadcasting_video"
                  />
                ))}
              </div>
            ) : broadcastingSearchTerm ? (
              <div className="line-empty">Nenhum Broadcasting encontrado.</div>
            ) : (
              <div className="line-empty">Todos os Broadcastings foram vistos.</div>
            )}
          </section>

          <section className="despertai-list-section">
            <div className="despertai-section-title">
              <h3>Vistos</h3>
              <span>{filteredFinishedBroadcasting.length}</span>
            </div>
            {filteredFinishedBroadcasting.length ? (
              <div className="reading-video-list reading-video-finished-list">
                {filteredFinishedBroadcasting.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    busy={patchMutation.isPending}
                    onPatch={patch}
                    selected={broadcastingWheelResultId === video.id}
                    elementId={broadcastingElementId(video.id)}
                    toggleType="toggle_broadcasting_video"
                  />
                ))}
              </div>
            ) : broadcastingSearchTerm ? (
              <div className="line-empty">Nenhum Broadcasting encontrado.</div>
            ) : (
              <div className="line-empty">Nenhum Broadcasting visto ainda.</div>
            )}
          </section>
        </section>
      ) : (
        <section className="despertai-tab-panel bible-panel">
          <div className="reading-summary-grid">
            <article className="reading-summary-card main">
              <ProgressDonut value={data.bible.progressPercent} label="Bíblia" />
              <div>
                <p className="panel-kicker">Leitura bíblica</p>
                <h3>{data.bible.readChapters}/{data.bible.totalChapters} capítulos</h3>
              </div>
            </article>
          </div>

          <div className="bible-section-stack">
            {data.bible.sections.map((section) => (
              <section key={section.title} className="bible-section-card">
                <h3>{section.title}</h3>
                <div className="bible-book-grid">
                  {section.books.map((book) => {
                    const read = new Set(book.readChapters);
                    return (
                      <article key={book.key} className="bible-book-card">
                        <div className="bible-book-head">
                          <div>
                            <h4>{book.name}</h4>
                            <p>{book.readCount}/{book.chapters}</p>
                          </div>
                          <ProgressDonut value={book.progressPercent} label="" />
                        </div>
                        <div className="bible-chapter-grid">
                          {Array.from({ length: book.chapters }, (_item, index) => index + 1).map((chapter) => (
                            <label
                              key={chapter}
                              className={`bible-chapter ${read.has(chapter) ? "read" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={read.has(chapter)}
                                disabled={patchMutation.isPending}
                                onChange={(event) =>
                                  patch({
                                    type: "toggle_bible_chapter",
                                    book_key: book.key,
                                    chapter,
                                    read: event.target.checked,
                                  })
                                }
                              />
                              <span>{chapter}</span>
                            </label>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
