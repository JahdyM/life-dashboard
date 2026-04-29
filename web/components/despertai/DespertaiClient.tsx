"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import InlineActionNotice from "@/components/common/InlineActionNotice";
import { fetchJson } from "@/lib/client/api";
import type { DespertaiIssue, ReadingPageData } from "@/lib/types";

type ReadingPatchPayload =
  | { type: "import_despertai"; raw: string }
  | { type: "toggle_despertai_topic"; issue_id: string; topic_id: string; read: boolean }
  | { type: "toggle_despertai_issue"; issue_id: string; read: boolean }
  | { type: "set_despertai_read_count"; issue_id: string; read_count: number }
  | { type: "toggle_bible_chapter"; book_key: string; chapter: number; read: boolean };

type DespertaiClientProps = {
  initialData: ReadingPageData;
};

type ProgressStyle = CSSProperties & {
  "--progress-angle": string;
};

const queryKey = ["reading-progress"] as const;

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
}: {
  issue: DespertaiIssue;
  onPatch: (payload: ReadingPatchPayload) => void;
  busy: boolean;
}) {
  return (
    <article className={`despertai-issue-card ${issue.isFinished ? "finished" : ""}`}>
      <div className="despertai-issue-head">
        <ProgressDonut value={issue.progressPercent} label="lido" />
        <div className="despertai-issue-title-block">
          <p className="panel-kicker">{issue.year}{issue.dateLabel ? ` · ${issue.dateLabel}` : ""}</p>
          <h3>{issue.title}</h3>
          <p>{issue.readCount}/{issue.totalTopics} tópicos</p>
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
    </article>
  );
}

export default function DespertaiClient({ initialData }: DespertaiClientProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"despertai" | "bible">("despertai");
  const [importText, setImportText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

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

  const patch = (payload: ReadingPatchPayload) => {
    patchMutation.mutate(payload);
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

          <section className="despertai-list-section">
            <div className="despertai-section-title">
              <h3>Não lidas</h3>
              <span>recentes primeiro</span>
            </div>
            {data.despertai.pendingIssues.length ? (
              <div className="despertai-issue-list">
                {data.despertai.pendingIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    busy={patchMutation.isPending}
                    onPatch={patch}
                  />
                ))}
              </div>
            ) : (
              <div className="line-empty">Cole sua tabela para começar.</div>
            )}
          </section>

          <section className="despertai-list-section">
            <div className="despertai-section-title">
              <h3>Lidas</h3>
              <span>{data.despertai.finishedIssuesList.length}</span>
            </div>
            {data.despertai.finishedIssuesList.length ? (
              <div className="despertai-finished-list">
                {data.despertai.finishedIssuesList.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    busy={patchMutation.isPending}
                    onPatch={patch}
                  />
                ))}
              </div>
            ) : (
              <div className="line-empty">Nenhuma revista concluída.</div>
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
