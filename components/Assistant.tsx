"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCurrentSchema } from "@/lib/store";
import { engineBadge, useAi } from "@/lib/ai/useAi";
import { openAiSettings } from "@/lib/ai/settings";
import { chatPrompt } from "@/lib/ai/shared";
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
  const { engine, loading } = useAi();
  const [copied, setCopied] = useState(false);
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
      if (!engine) throw new Error("No AI is set up. Open AI settings, or use Copy prompt to ask any AI you already use.");
      let answer = "";
      for await (const chunk of engine.chat(history, schema, controller.signal)) {
        answer += chunk;
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

  /** Everything an outside AI needs (instructions, table, conversation, question) in one block. */
  async function copyPrompt() {
    const question = input.trim() || "Help me with this table.";
    await navigator.clipboard.writeText(chatPrompt([...messages, { role: "user", content: question }], schema));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
        <button onClick={openAiSettings} className="label flex items-center gap-2 border border-line px-2.5 py-1 text-muted transition-colors hover:border-ink hover:text-ink">
          <span className={`h-1.5 w-1.5 rounded-full ${engine ? (engine.onDevice ? "bg-ink" : "bg-coral") : "bg-line"}`} />
          {engine ? engineBadge(engine) : loading ? "Checking AI…" : "AI off"} · settings
        </button>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} disabled={busy} className="ml-auto text-xs text-muted hover:text-ink">
            Clear chat
          </button>
        )}
      </div>

      {!loading && !engine && (
        <div className="mb-4">
          <Notice>
            No AI is set up yet. <button onClick={openAiSettings} className="font-semibold underline">Open AI settings</button> to add your own key (Claude, GPT, Gemini and more),
            run a free model in your browser or on your computer, or skip AI entirely: type a question and use <b>Copy prompt</b> to take it,
            with your table&apos;s context, to any AI chat you already use. For common tasks,{" "}
            <Link href="/templates" className="underline">SQL Templates</Link> needs no AI at all.
          </Notice>
        </div>
      )}

      <div className="flex-1 space-y-4">
        {messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => (engine ? send(s) : setInput(s))}
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
          placeholder={engine ? "Ask for SQL, a merge, a DAG, tests… (Enter to send)" : "Type a question, then Copy prompt to use it in any AI chat"}
          className="flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm focus:border-ink focus:outline-none"
        />
        {busy ? (
          <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button type="submit" variant="accent" disabled={!engine || !input.trim()}>
              Send
            </Button>
            <Button type="button" variant="ghost" onClick={copyPrompt} title="Copy this question with your table's context, to paste into any AI chat">
              {copied ? "Copied ✓" : "Copy prompt"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
