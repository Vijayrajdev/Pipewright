"use client";

import { useState } from "react";

/** Renders assistant text, splitting out fenced code blocks with a copy button. */
export function MessageBody({ text }: { text: string }) {
  const parts = text.split(/(```[\w-]*\n[\s\S]*?(?:```|$))/g).filter(Boolean);
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const m = /^```([\w-]*)\n([\s\S]*?)(?:```)?$/.exec(part);
        return m ? <CodeBlock key={i} lang={m[1]} code={m[2].replace(/\n$/, "")} /> : <Prose key={i} text={part} />;
      })}
    </div>
  );
}

function Prose({ text }: { text: string }) {
  // light inline formatting: `code` and **bold**
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {tokens.map((t, i) =>
        t.startsWith("`") && t.endsWith("`") && t.length > 2 ? (
          <code key={i} className="rounded bg-ink-soft px-1 font-mono text-[0.85em] text-ink-deep">
            {t.slice(1, -1)}
          </code>
        ) : t.startsWith("**") && t.endsWith("**") && t.length > 4 ? (
          <strong key={i}>{t.slice(2, -2)}</strong>
        ) : (
          t
        ),
      )}
    </p>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg bg-code">
      <div className="flex items-center justify-between border-b border-cream/10 px-3 py-1.5 text-xs text-cream/70">
        <span className="font-mono">{lang || "code"}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked */
            }
          }}
          className="rounded px-2 py-0.5 hover:bg-white/10 hover:text-coral"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-cream">
        <code>{code}</code>
      </pre>
    </div>
  );
}
