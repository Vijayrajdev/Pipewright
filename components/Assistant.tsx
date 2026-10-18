"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCurrentSchema } from "@/lib/store";
import { useAiStatus } from "@/lib/useAiStatus";
import { MessageBody } from "./MessageBody";
import { LogoMark } from "./Logo";
import { Button, Notice } from "./ui";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Write a query that deduplicates this table, keeping the latest row per key.",
  "Write a BigQuery MERGE that loads this table as SCD Type 2.",
  "Suggest a partitioning and clustering strategy, and explain why.",
  "Generate dbt schema.yml tests for this table.",
  "Draft an Airflow DAG that loads this table daily from GCS.",
];

export function Assistant() {
  const [schema] = useCurrentSchema();
  const ai = useAiStatus();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history: Message[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, schema }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: answer }]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages([...history, { role: "assistant", content: `_${(err as Error).message}_` }]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {schema ? (
          <span className="rounded-full bg-ink-soft px-3 py-1 text-ink-deep">
            Context: <span className="font-mono">{schema.dataset ? `${schema.dataset}.` : ""}{schema.name}</span> ·{" "}
            {schema.fields.length} columns
          </span>
        ) : (
          <span className="text-muted">
            No table loaded. <Link href="/schema" className="text-ink underline">Build one</Link> to give Pipewright context.
          </span>
        )}
        {ai.enabled && (
          <span className="label border border-line px-2.5 py-1 text-muted">
            {ai.provider === "ollama" ? `${ai.model} · local · free` : `${ai.model} · Claude`}
          </span>
        )}
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} disabled={busy} className="ml-auto text-xs text-muted hover:text-ink">
            Clear chat
          </button>
        )}
      </div>

      {!ai.loading && !ai.enabled && (
        <div className="mb-4">
          <Notice>
            AI is off. For a free local model, install <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline">Ollama</a> and run{" "}
            <code className="font-mono">ollama pull llama3.2</code>, then reload. Or add <code className="font-mono">ANTHROPIC_API_KEY</code> to{" "}
            <code className="font-mono">.env.local</code>. For common tasks (dedupe, MERGE, SCD2, data checks, dbt tests),{" "}
            <Link href="/templates" className="underline">SQL Templates</Link> works without a key.
          </Notice>
        </div>
      )}

      <div className="flex-1 space-y-4">
        {messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={!ai.enabled}
                className="rounded-lg border border-line bg-paper p-3 text-left text-sm text-text transition-colors hover:border-coral disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex animate-pop gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <LogoMark size={32} tile className="mt-1 shrink-0" />}
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm text-paper whitespace-pre-wrap"
                  : "min-w-0 max-w-full flex-1 rounded-2xl rounded-bl-sm border border-line bg-paper px-4 py-3"
              }
            >
              {m.role === "user" ? (
                m.content
              ) : m.content ? (
                <MessageBody text={m.content} />
              ) : (
                <span className="flex gap-1 py-1" aria-label="Thinking">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-coral" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 mt-6 flex gap-2 bg-ivory py-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder={ai.enabled ? "Ask for SQL, a merge, a DAG, tests… (Enter to send)" : "AI is off"}
          disabled={!ai.enabled}
          className="flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm focus:border-ink focus:outline-none"
        />
        {busy ? (
          <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        ) : (
          <Button type="submit" variant="accent" disabled={!ai.enabled || !input.trim()}>
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
