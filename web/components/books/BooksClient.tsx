"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Pencil, RotateCcw, Star, Trash2, X } from "lucide-react";
import InlineActionNotice from "@/components/common/InlineActionNotice";
import { fetchJson } from "@/lib/client/api";
import type { BookEntry, BooksPageData } from "@/lib/types";

type BookMutationResponse = {
  item: BookEntry;
  data: BooksPageData;
};

type BookEditDraft = {
  title: string;
  author: string;
  coverUrl: string;
  totalPages: string;
  pagesRead: string;
  status: BookEntry["status"];
  rating: string;
};

function parseOptionalInt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function clampPagesRead(pagesRead: number | null, totalPages: number | null) {
  if (pagesRead === null) return 0;
  if (totalPages === null) return Math.max(0, pagesRead);
  return Math.max(0, Math.min(pagesRead, totalPages));
}

function bookProgress(book: BookEntry) {
  if (!book.totalPages || book.totalPages <= 0) return null;
  return Math.min(100, Math.round((book.pagesRead / book.totalPages) * 100));
}

const passthroughLoader = ({ src }: ImageLoaderProps) => src;

export default function BooksClient({ initialData }: { initialData: BooksPageData }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(initialData.year);
  const [goalDraft, setGoalDraft] = useState(String(initialData.yearlyGoal || 0));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newCoverUrl, setNewCoverUrl] = useState("");
  const [newTotalPages, setNewTotalPages] = useState("");
  const [newPagesRead, setNewPagesRead] = useState("0");
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BookEditDraft | null>(null);

  const booksQuery = useQuery({
    queryKey: ["books", year],
    queryFn: () => fetchJson<BooksPageData>(`/api/books?year=${year}`),
    initialData: year === initialData.year ? initialData : undefined,
  });

  const data = booksQuery.data;
  const items = data?.items || [];

  useEffect(() => {
    if (!data) return;
    setGoalDraft(String(data.yearlyGoal || 0));
  }, [data]);

  const pageQueryKey = useMemo(() => ["books", year] as const, [year]);

  const setBooksData = useCallback(
    (payload: BooksPageData) => {
      queryClient.setQueryData(pageQueryKey, payload);
      setGoalDraft(String(payload.yearlyGoal || 0));
    },
    [pageQueryKey, queryClient]
  );

  const updateGoalMutation = useMutation({
    mutationFn: (nextGoal: number) =>
      fetchJson<BooksPageData>("/api/books/goal", {
        method: "PUT",
        body: JSON.stringify({
          year,
          yearly_goal: nextGoal,
        }),
      }),
    onSuccess: (payload) => {
      setSaveError(null);
      setBooksData(payload);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to save goal.";
      setSaveError(`Couldn't save yearly goal. ${message}`);
    },
  });

  const createBookMutation = useMutation({
    mutationFn: () =>
      fetchJson<BookMutationResponse>("/api/books", {
        method: "POST",
        body: JSON.stringify({
          year,
          title: newTitle.trim(),
          author: newAuthor.trim() || null,
          cover_url: newCoverUrl.trim() || null,
          total_pages: parseOptionalInt(newTotalPages),
          pages_read: parseOptionalInt(newPagesRead) ?? 0,
          status: "reading",
          rating: null,
        }),
      }),
    onSuccess: (payload) => {
      setSaveError(null);
      setBooksData(payload.data);
      setNewTitle("");
      setNewAuthor("");
      setNewCoverUrl("");
      setNewTotalPages("");
      setNewPagesRead("0");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to create book.";
      setSaveError(`Couldn't add book. ${message}`);
    },
  });

  const patchBookMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      fetchJson<BookMutationResponse>(`/api/books/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (payload) => {
      setSaveError(null);
      if (payload.data.year !== year) {
        void booksQuery.refetch();
        return;
      }
      setBooksData(payload.data);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to update book.";
      setSaveError(`Couldn't update book. ${message}`);
    },
  });

  const deleteBookMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson<BooksPageData>(`/api/books/${id}?year=${year}`, {
        method: "DELETE",
      }),
    onSuccess: (payload) => {
      setSaveError(null);
      setBooksData(payload);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to remove book.";
      setSaveError(`Couldn't delete book. ${message}`);
    },
  });

  const handleAddBook = useCallback(() => {
    if (!newTitle.trim() || createBookMutation.isPending) return;
    createBookMutation.mutate();
  }, [createBookMutation, newTitle]);

  const handleAddBookEnter = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handleAddBook();
    },
    [handleAddBook]
  );

  const openBookEditor = useCallback((book: BookEntry) => {
    setEditingBookId(book.id);
    setEditDraft({
      title: book.title,
      author: book.author || "",
      coverUrl: book.coverUrl || "",
      totalPages: book.totalPages ? String(book.totalPages) : "",
      pagesRead: String(book.pagesRead || 0),
      status: book.status,
      rating: book.rating ? String(book.rating) : "",
    });
  }, []);

  const closeBookEditor = useCallback(() => {
    setEditingBookId(null);
    setEditDraft(null);
  }, []);

  useEffect(() => {
    if (!editDraft) return undefined;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeBookEditor();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeBookEditor, editDraft]);

  const commitGoal = useCallback(() => {
    const parsed = parseOptionalInt(goalDraft);
    const next = Math.max(0, parsed ?? 0);
    updateGoalMutation.mutate(next);
  }, [goalDraft, updateGoalMutation]);

  const commitPages = useCallback(
    (book: BookEntry, nextReadRaw: string, nextTotalRaw: string) => {
      const parsedTotal = parseOptionalInt(nextTotalRaw);
      const normalizedTotal = parsedTotal === null ? null : Math.max(1, parsedTotal);
      const parsedRead = parseOptionalInt(nextReadRaw);
      const normalizedRead = clampPagesRead(parsedRead, normalizedTotal);
      patchBookMutation.mutate({
        id: book.id,
        patch: {
          total_pages: normalizedTotal,
          pages_read: normalizedRead,
        },
      });
    },
    [patchBookMutation]
  );

  const markAsFinished = useCallback(
    (book: BookEntry) => {
      patchBookMutation.mutate({
        id: book.id,
        patch: {
          status: "finished",
          pages_read: book.totalPages || book.pagesRead,
          rating: book.rating,
        },
      });
    },
    [patchBookMutation]
  );

  const markAsReading = useCallback(
    (book: BookEntry) => {
      patchBookMutation.mutate({
        id: book.id,
        patch: {
          status: "reading",
          rating: null,
        },
      });
    },
    [patchBookMutation]
  );

  const saveBookEditor = useCallback(() => {
    if (!editingBookId || !editDraft?.title.trim() || patchBookMutation.isPending) return;

    const parsedTotal = parseOptionalInt(editDraft.totalPages);
    const normalizedTotal = parsedTotal === null ? null : Math.max(1, parsedTotal);
    const parsedRead = parseOptionalInt(editDraft.pagesRead);
    const normalizedRead = clampPagesRead(parsedRead, normalizedTotal);
    const parsedRating = parseOptionalInt(editDraft.rating);

    patchBookMutation.mutate(
      {
        id: editingBookId,
        patch: {
          title: editDraft.title.trim(),
          author: editDraft.author.trim() || null,
          cover_url: editDraft.coverUrl.trim() || null,
          total_pages: normalizedTotal,
          pages_read: normalizedRead,
          status: editDraft.status,
          rating: parsedRating,
        },
      },
      {
        onSuccess: closeBookEditor,
      }
    );
  }, [closeBookEditor, editDraft, editingBookId, patchBookMutation]);

  return (
    <div className="card books-shell">
      <section className="books-toolbar">
        <button type="button" className="chip" onClick={() => setYear((value) => value - 1)}>
          ←
        </button>
        <strong>{year}</strong>
        <button type="button" className="chip" onClick={() => setYear((value) => value + 1)}>
          →
        </button>
      </section>

      {saveError ? <InlineActionNotice tone="warning" body={saveError} /> : null}

      <section className="books-summary-grid">
        <article className="books-summary-card">
          <p className="panel-kicker">Year goal</p>
          <div className="books-goal-row">
            <input
              type="number"
              min={0}
              max={500}
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
              onBlur={commitGoal}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commitGoal();
              }}
              aria-label="Books goal for the year"
            />
            <span>books</span>
          </div>
        </article>

        <article className="books-summary-card">
          <p className="panel-kicker">Finished</p>
          <strong>{data?.finishedCount || 0}</strong>
        </article>

        <article className="books-summary-card">
          <p className="panel-kicker">Reading</p>
          <strong>{data?.readingCount || 0}</strong>
        </article>

        <article className="books-summary-card">
          <p className="panel-kicker">Progress</p>
          <strong>{data?.progressPercent || 0}%</strong>
        </article>
      </section>

      <section className="books-add-card">
        <div className="books-add-grid">
          <input
            type="text"
            placeholder="Book title"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={handleAddBookEnter}
          />
          <input
            type="text"
            placeholder="Author (optional)"
            value={newAuthor}
            onChange={(event) => setNewAuthor(event.target.value)}
            onKeyDown={handleAddBookEnter}
          />
          <input
            type="url"
            placeholder="Cover URL"
            value={newCoverUrl}
            onChange={(event) => setNewCoverUrl(event.target.value)}
            onKeyDown={handleAddBookEnter}
          />
          <input
            type="number"
            min={1}
            placeholder="Total pages"
            value={newTotalPages}
            onChange={(event) => setNewTotalPages(event.target.value)}
            onKeyDown={handleAddBookEnter}
          />
          <input
            type="number"
            min={0}
            placeholder="Pages read"
            value={newPagesRead}
            onChange={(event) => setNewPagesRead(event.target.value)}
            onKeyDown={handleAddBookEnter}
          />
          <button
            type="button"
            className="primary"
            onClick={handleAddBook}
            disabled={!newTitle.trim() || createBookMutation.isPending}
          >
            {createBookMutation.isPending ? "Saving…" : "Add"}
          </button>
        </div>
      </section>

      {booksQuery.isPending ? <div className="query-status">Loading…</div> : null}
      {booksQuery.isError ? (
        <InlineActionNotice
          tone="error"
          body="Couldn't load books."
          actionLabel="Retry"
          onAction={() => {
            void booksQuery.refetch();
          }}
        />
      ) : null}

      <section className="books-grid" aria-label="Books grid">
        {!booksQuery.isPending && !booksQuery.isError && items.length === 0 ? (
          <div className="line-empty">No books yet.</div>
        ) : null}

        {items.map((book) => {
          const progress = bookProgress(book);
          return (
            <article
              key={`${book.id}-${book.updatedAt}`}
              className={`books-book-card ${book.status}`}
            >
              <div className="books-cover-stage">
                {book.coverUrl ? (
                  <Image
                    className="books-book-cover"
                    src={book.coverUrl}
                    alt={`${book.title} cover`}
                    width={184}
                    height={276}
                    loader={passthroughLoader}
                    unoptimized
                  />
                ) : (
                  <div className="books-book-cover books-book-cover-empty" aria-hidden="true">
                    <BookOpen size={38} />
                  </div>
                )}
                <span className={`books-status-badge ${book.status}`}>{book.status}</span>
              </div>

              <div className="books-book-body">
                <div className="books-book-title-row">
                  <h3 title={book.title}>{book.title}</h3>
                  {book.rating ? (
                    <span className="books-card-rating" aria-label={`${book.rating} out of 5 stars`}>
                      <Star size={14} />
                      {book.rating}
                    </span>
                  ) : null}
                </div>
                <p>{book.author || "Unknown author"}</p>

                <div className="books-progress-track" aria-label="Reading progress">
                  <span style={{ width: `${progress ?? 0}%` }} />
                </div>
                <div className="books-progress-line">
                  <span>
                    {book.pagesRead}
                    {book.totalPages ? `/${book.totalPages}` : ""} pages
                  </span>
                  <strong>{progress === null ? "--" : `${progress}%`}</strong>
                </div>

                <div className="books-card-inputs">
                  <label>
                    Read
                    <input
                      type="number"
                      min={0}
                      defaultValue={book.pagesRead}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        event.currentTarget.blur();
                      }}
                      onBlur={(event) => {
                        const parent = event.currentTarget.closest(".books-card-inputs");
                        const totalInput = parent?.querySelector<HTMLInputElement>('input[data-role="total-pages"]');
                        commitPages(book, event.currentTarget.value, totalInput?.value || String(book.totalPages || ""));
                      }}
                    />
                  </label>
                  <label>
                    Total
                    <input
                      data-role="total-pages"
                      type="number"
                      min={1}
                      defaultValue={book.totalPages || ""}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        event.currentTarget.blur();
                      }}
                      onBlur={(event) => {
                        const parent = event.currentTarget.closest(".books-card-inputs");
                        const readInput = parent?.querySelector<HTMLInputElement>('input[type="number"]');
                        commitPages(book, readInput?.value || String(book.pagesRead), event.currentTarget.value);
                      }}
                    />
                  </label>
                </div>

                <div className="books-card-actions">
                  {book.status !== "finished" ? (
                    <button
                      type="button"
                      className="books-icon-action"
                      onClick={() => markAsFinished(book)}
                      aria-label={`Mark ${book.title} as read`}
                      title="Mark read"
                    >
                      <Check size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="books-icon-action"
                      onClick={() => markAsReading(book)}
                      aria-label={`Reopen ${book.title}`}
                      title="Reopen"
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}

                  {book.status === "finished" ? (
                    <label className="books-rating-select">
                      <Star size={14} aria-hidden="true" />
                      <select
                        value={book.rating || ""}
                        onChange={(event) => {
                          const parsed = parseOptionalInt(event.target.value);
                          patchBookMutation.mutate({
                            id: book.id,
                            patch: { rating: parsed },
                          });
                        }}
                      >
                        <option value="">-</option>
                        <option value="1">1 ★</option>
                        <option value="2">2 ★</option>
                        <option value="3">3 ★</option>
                        <option value="4">4 ★</option>
                        <option value="5">5 ★</option>
                      </select>
                    </label>
                  ) : null}

                  <button
                    type="button"
                    className="books-icon-action"
                    onClick={() => openBookEditor(book)}
                    aria-label={`Edit ${book.title}`}
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>

                  <button
                    type="button"
                    className="books-icon-action danger"
                    onClick={() => deleteBookMutation.mutate(book.id)}
                    aria-label={`Remove ${book.title}`}
                    title="Remove"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {editDraft ? (
        <div className="books-edit-layer">
          <button
            type="button"
            className="books-edit-scrim"
            onClick={closeBookEditor}
            aria-label="Close book editor"
          />
          <form
            className="books-edit-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Edit book"
            onSubmit={(event) => {
              event.preventDefault();
              saveBookEditor();
            }}
          >
            <header className="books-edit-head">
              <div>
                <p className="panel-kicker">Edit book</p>
                <h3>{editDraft.title || "Untitled"}</h3>
              </div>
              <button
                type="button"
                className="books-icon-action"
                onClick={closeBookEditor}
                aria-label="Close editor"
              >
                <X size={16} />
              </button>
            </header>

            <div className="books-edit-form">
              <label>
                Title
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={(event) =>
                    setEditDraft((draft) => (draft ? { ...draft, title: event.target.value } : draft))
                  }
                />
              </label>
              <label>
                Author
                <input
                  type="text"
                  value={editDraft.author}
                  onChange={(event) =>
                    setEditDraft((draft) => (draft ? { ...draft, author: event.target.value } : draft))
                  }
                />
              </label>
              <label className="books-edit-wide">
                Cover URL
                <input
                  type="url"
                  value={editDraft.coverUrl}
                  onChange={(event) =>
                    setEditDraft((draft) => (draft ? { ...draft, coverUrl: event.target.value } : draft))
                  }
                  placeholder="https://..."
                />
              </label>
              <label>
                Pages read
                <input
                  type="number"
                  min={0}
                  value={editDraft.pagesRead}
                  onChange={(event) =>
                    setEditDraft((draft) => (draft ? { ...draft, pagesRead: event.target.value } : draft))
                  }
                />
              </label>
              <label>
                Total pages
                <input
                  type="number"
                  min={1}
                  value={editDraft.totalPages}
                  onChange={(event) =>
                    setEditDraft((draft) => (draft ? { ...draft, totalPages: event.target.value } : draft))
                  }
                />
              </label>
              <label>
                Status
                <select
                  value={editDraft.status}
                  onChange={(event) =>
                    setEditDraft((draft) =>
                      draft ? { ...draft, status: event.target.value as BookEntry["status"] } : draft
                    )
                  }
                >
                  <option value="planned">Planned</option>
                  <option value="reading">Reading</option>
                  <option value="finished">Finished</option>
                </select>
              </label>
              <label>
                Rating
                <select
                  value={editDraft.rating}
                  onChange={(event) =>
                    setEditDraft((draft) => (draft ? { ...draft, rating: event.target.value } : draft))
                  }
                  disabled={editDraft.status !== "finished"}
                >
                  <option value="">No rating</option>
                  <option value="1">1 ★</option>
                  <option value="2">2 ★</option>
                  <option value="3">3 ★</option>
                  <option value="4">4 ★</option>
                  <option value="5">5 ★</option>
                </select>
              </label>
            </div>

            <footer className="books-edit-actions">
              <button type="button" className="secondary" onClick={closeBookEditor}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={!editDraft.title.trim() || patchBookMutation.isPending}
              >
                {patchBookMutation.isPending ? "Saving…" : "Save"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
