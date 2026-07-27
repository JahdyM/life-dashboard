"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Bot, Check, CornerDownLeft, LoaderCircle, Orbit, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client/api";
import type {
  AssistantAction,
  AssistantChatMessage,
  AssistantReply,
} from "@/lib/assistant";

type UiMessage = AssistantChatMessage & {
  id: string;
  actions?: AssistantAction[];
  applied?: boolean;
};

const STORAGE_KEY = "life-dashboard-orbit-chat-v1";

function actionLabel(action: AssistantAction) {
  if (action.type === "create_task") return "New task";
  if (action.type === "update_task") return "Update";
  return "New habit";
}

function actionMeta(action: AssistantAction) {
  const parts = [
    action.payload.scheduledDate,
    action.payload.scheduledTime,
    action.payload.estimatedMinutes ? `${action.payload.estimatedMinutes} min` : null,
    action.payload.priority,
    action.payload.areaTag,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function AssistantClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Tell me what you need. I can organize your day, estimate time, review your rhythm, or draft a routine.",
    },
  ]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as UiMessage[];
      if (Array.isArray(parsed) && parsed.length) setMessages(parsed.slice(-20));
    } catch (_error) {
      // A broken local draft should never block the assistant.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const payload = await fetchJson<AssistantReply>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          mode: "chat",
          messages: nextMessages.slice(-12).map(({ role, content: text }) => ({
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
          content: payload.message,
          actions: payload.actions,
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Orbit is unavailable.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function applyPlan(messageId: string, actions: AssistantAction[]) {
    if (applyingId) return;
    setApplyingId(messageId);
    setError(null);
    try {
      await fetchJson<{ items: Array<{ id: string }> }>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ mode: "apply", actions }),
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, applied: true } : message
        )
      );
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["custom-habits"] });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not apply plan.");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="route-stack assistant-page">
      <section className="assistant-hero">
        <div className="assistant-orbit-mark" aria-hidden="true">
          <Orbit size={26} />
        </div>
        <div>
          <p className="panel-kicker">Life assistant</p>
          <h2>Orbit</h2>
          <p>Plan, estimate, and notice patterns.</p>
        </div>
        <span className="assistant-free-badge">Free tier</span>
      </section>

      <section className="assistant-chat" aria-live="polite">
        <div className="assistant-thread">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`assistant-message ${message.role}`}
            >
              <div className="assistant-message-icon" aria-hidden="true">
                {message.role === "assistant" ? <Bot size={16} /> : <Sparkles size={15} />}
              </div>
              <div className="assistant-message-body">
                <p>{message.content}</p>
                {message.actions?.length ? (
                  <div className="assistant-plan">
                    {message.actions.map((action) => (
                      <div key={action.id} className="assistant-plan-item">
                        <span>{actionLabel(action)}</span>
                        <strong>{action.title}</strong>
                        {actionMeta(action) ? <small>{actionMeta(action)}</small> : null}
                        {action.reason ? <small>{action.reason}</small> : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="assistant-apply"
                      disabled={message.applied || applyingId === message.id}
                      onClick={() => void applyPlan(message.id, message.actions || [])}
                    >
                      {message.applied ? (
                        <>
                          <Check size={15} /> Applied
                        </>
                      ) : applyingId === message.id ? (
                        <>
                          <LoaderCircle size={15} className="spin" /> Applying
                        </>
                      ) : (
                        "Apply plan"
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {sending ? (
            <div className="assistant-thinking">
              <LoaderCircle size={15} className="spin" /> Thinking
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        {error ? <p className="assistant-error">{error}</p> : null}

        <form className="assistant-composer" onSubmit={sendMessage}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Organize tomorrow, estimate a task, review my week…"
            rows={2}
            maxLength={6000}
            disabled={sending}
            aria-label="Message Orbit"
          />
          <button type="submit" disabled={!input.trim() || sending} aria-label="Send">
            <CornerDownLeft size={18} />
          </button>
        </form>
        <p className="assistant-hint">Enter sends · plans require one review</p>
      </section>
    </div>
  );
}
