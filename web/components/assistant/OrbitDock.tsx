"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Bot, CornerDownLeft, LoaderCircle, Orbit, Trash2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AssistantAction,
  AssistantChatMessage,
  AssistantReply,
  AssistantScope,
} from "@/lib/assistant";
import { fetchJson } from "@/lib/client/api";
import AssistantPlanPreview from "./AssistantPlanPreview";

type DockMessage = AssistantChatMessage & {
  id: string;
  actions?: AssistantAction[];
  applied?: boolean;
};

const PAGE_CONTEXT: Array<{
  prefix: string;
  scope: AssistantScope;
  label: string;
}> = [
  { prefix: "/calendar", scope: "calendar", label: "Calendar" },
  { prefix: "/habits", scope: "habits", label: "Habits" },
  { prefix: "/ministry", scope: "ministry", label: "Ministry" },
  { prefix: "/mood", scope: "mood", label: "Mood" },
  { prefix: "/dissertation", scope: "dissertation", label: "Dissertation" },
  { prefix: "/stats", scope: "stats", label: "Stats" },
  { prefix: "/finances", scope: "finances", label: "Finances" },
  { prefix: "/books", scope: "books", label: "Books" },
  { prefix: "/despertai", scope: "publications", label: "Publications" },
  { prefix: "/goals", scope: "goals", label: "Goals" },
  { prefix: "/spiritual", scope: "spiritual", label: "Spiritual" },
  { prefix: "/couple", scope: "couple", label: "Couple" },
  { prefix: "/today", scope: "today", label: "Today" },
];

function contextForPath(pathname: string) {
  return (
    PAGE_CONTEXT.find((item) => pathname.startsWith(item.prefix)) || {
      scope: "all" as const,
      label: "dashboard",
    }
  );
}

export default function OrbitDock() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const context = useMemo(() => contextForPath(pathname), [pathname]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DockMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessages([]);
    setOpen(false);
    setError(null);
  }, [pathname]);

  if (pathname.startsWith("/assistant")) return null;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    const userMessage: DockMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setOpen(true);
    setSending(true);
    setError(null);
    try {
      const reply = await fetchJson<AssistantReply>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          mode: "chat",
          scope: context.scope,
          messages: next.slice(-8).map(({ role, content: text }) => ({
            role,
            content: text,
          })),
        }),
      });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply.message,
          actions: reply.actions,
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Orbit is unavailable.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void send();
    }
    if (event.key === "Escape") {
      setInput("");
      setOpen(false);
    }
  }

  async function apply(messageId: string, actions: AssistantAction[]) {
    if (applyingId) return;
    setApplyingId(messageId);
    setError(null);
    try {
      await fetchJson("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ mode: "apply", actions }),
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, applied: true } : message
        )
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["custom-habits"] }),
        queryClient.invalidateQueries({ queryKey: ["custom-habits-done"] }),
        queryClient.invalidateQueries({ queryKey: ["day"] }),
        queryClient.invalidateQueries({ queryKey: ["entries"] }),
        queryClient.invalidateQueries({ queryKey: ["mood-history"] }),
        queryClient.invalidateQueries({ queryKey: ["task-areas"] }),
        queryClient.invalidateQueries({ queryKey: ["energy-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["ministry-month"] }),
        queryClient.invalidateQueries({ queryKey: ["reading-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["books"] }),
        queryClient.invalidateQueries({ queryKey: ["spiritual-streaks"] }),
        queryClient.invalidateQueries({ queryKey: ["spiritual-goals"] }),
        queryClient.invalidateQueries({ queryKey: ["dissertation"] }),
        queryClient.invalidateQueries({ queryKey: ["dissertation-project"] }),
        queryClient.invalidateQueries({ queryKey: ["couple-goals"] }),
        queryClient.invalidateQueries({ queryKey: ["bucket-list"] }),
        queryClient.invalidateQueries({ queryKey: ["finances"] }),
        queryClient.invalidateQueries({ queryKey: ["finances-savings"] }),
        queryClient.invalidateQueries({ queryKey: ["rewards"] }),
      ]);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not apply plan.");
    } finally {
      setApplyingId(null);
    }
  }

  function clearConversation() {
    setMessages([]);
    setInput("");
    setError(null);
    setOpen(false);
  }

  const latest = [...messages].reverse().find((message) => message.role === "assistant");

  return (
    <aside className={`orbit-dock ${open ? "open" : ""}`} aria-label="Orbit assistant">
      {open ? (
        <section className="orbit-dock-panel" aria-live="polite">
          <header>
            <div>
              <Bot size={16} />
              <strong>Orbit · {context.label}</strong>
            </div>
            <div className="orbit-dock-actions">
              <button
                type="button"
                onClick={clearConversation}
                aria-label="Clear Orbit conversation"
                title="Clear conversation"
                disabled={sending || Boolean(applyingId)}
              >
                <Trash2 size={15} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close Orbit">
                <X size={16} />
              </button>
            </div>
          </header>
          <div className="orbit-dock-answer">
            {sending ? (
              <p className="assistant-thinking">
                <LoaderCircle size={15} className="spin" /> Thinking
              </p>
            ) : latest ? (
              <>
                <p>{latest.content}</p>
                {latest.actions?.length ? (
                  <AssistantPlanPreview
                    actions={latest.actions}
                    applied={Boolean(latest.applied)}
                    applying={applyingId === latest.id}
                    compact
                    onApply={() => void apply(latest.id, latest.actions || [])}
                  />
                ) : null}
              </>
            ) : null}
            {error ? <p className="assistant-error">{error}</p> : null}
          </div>
          <Link href="/assistant" className="orbit-dock-full">
            Open full Orbit
          </Link>
        </section>
      ) : null}

      <form className="orbit-dock-composer" onSubmit={send}>
        <Orbit size={18} aria-hidden="true" />
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => latest && setOpen(true)}
          placeholder={`Ask Orbit about ${context.label}`}
          aria-label={`Ask Orbit about ${context.label}`}
          maxLength={6000}
          disabled={sending}
        />
        <button type="submit" disabled={!input.trim() || sending} aria-label="Send to Orbit">
          {sending ? <LoaderCircle size={17} className="spin" /> : <CornerDownLeft size={17} />}
        </button>
      </form>
    </aside>
  );
}
