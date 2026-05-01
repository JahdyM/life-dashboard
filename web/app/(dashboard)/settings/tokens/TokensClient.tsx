"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";

type TokenRecord = {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

type ListResp = { tokens: TokenRecord[] };
type CreateResp = { token: string; record: TokenRecord };

function formatDate(iso: string | null) {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TokensClient() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("write");
  const [revealed, setRevealed] = useState<{ token: string; name: string } | null>(null);

  const list = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => fetchJson<ListResp>("/api/auth/tokens"),
  });

  const create = useMutation({
    mutationFn: () =>
      fetchJson<CreateResp>("/api/auth/tokens", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), scope }),
      }),
    onSuccess: (data) => {
      setRevealed({ token: data.token, name: data.record.name });
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/auth/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["api-tokens"] }),
  });

  const copyToken = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.token);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="tokens-shell">
      {/* Reveal banner — shown once after creation */}
      {revealed ? (
        <section className="tokens-reveal">
          <div className="tokens-reveal-head">
            <strong>Token created · {revealed.name}</strong>
            <span>Save this now — you won&apos;t see it again.</span>
          </div>
          <code className="tokens-reveal-value">{revealed.token}</code>
          <div className="tokens-reveal-actions">
            <button type="button" onClick={copyToken}>Copy</button>
            <button type="button" className="secondary" onClick={() => setRevealed(null)}>
              Close
            </button>
          </div>
        </section>
      ) : null}

      {/* Create form */}
      <section className="card tokens-create-card">
        <h3>Create new token</h3>
        <div className="tokens-create-row">
          <input
            type="text"
            placeholder="ex: iPhone widget, Alexa skill"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <select value={scope} onChange={(e) => setScope(e.target.value as "read" | "write")}>
            <option value="write">Read + write</option>
            <option value="read">Read only</option>
          </select>
          <button
            type="button"
            disabled={create.isPending || !name.trim()}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create"}
          </button>
        </div>
        {create.isError ? <p className="form-error">Could not create token.</p> : null}
      </section>

      {/* Existing tokens */}
      <section className="card">
        <h3>Your tokens</h3>
        {list.isPending ? <p className="query-status quiet">Loading…</p> : null}
        {list.data && list.data.tokens.length === 0 ? (
          <p className="today-empty">No tokens yet. Create one above.</p>
        ) : null}
        {list.data && list.data.tokens.length > 0 ? (
          <ul className="tokens-list">
            {list.data.tokens.map((tok) => (
              <li key={tok.id} className="tokens-row">
                <div className="tokens-row-main">
                  <strong>{tok.name}</strong>
                  <code>{tok.prefix}…</code>
                  <span className={`tokens-scope tokens-scope-${tok.scope}`}>{tok.scope}</span>
                </div>
                <div className="tokens-row-meta">
                  <span>Created {formatDate(tok.createdAt)}</span>
                  <span>Last used {formatDate(tok.lastUsedAt)}</span>
                </div>
                <button
                  type="button"
                  className="secondary danger"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (confirm(`Revoke "${tok.name}"? Any client using it will stop working.`)) {
                      revoke.mutate(tok.id);
                    }
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
