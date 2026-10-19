"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TOOLS } from "@/lib/tools";
import { DOC_SECTIONS } from "@/lib/docs";
import { setTheme, useTheme } from "@/lib/theme";
import { openAiSettings } from "@/lib/ai/settings";

/** Fire this to open the palette from anywhere (e.g. the search button in the nav). */
export const OPEN_PALETTE = "pipewright:palette";
export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE));

interface Item {
  id: string;
  group: "Tools" | "Pages" | "Docs" | "Actions";
  title: string;
  hint: string;
  icon: string;
  run: () => void;
}

/** Subsequence match with a bonus for word starts; 0 = no match. */
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) return 100 - at + (at === 0 || t[at - 1] === " " ? 50 : 0);
  let i = 0;
  let s = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      s += j === 0 || t[j - 1] === " " ? 3 : 1;
      i++;
    }
  }
  return i === q.length ? s : 0;
}

export function CommandPalette() {
  const router = useRouter();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const show = () => {
      setQuery("");
      setCursor(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setCursor(0);
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE, show);
    };
  }, []);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      ...TOOLS.filter((t) => t.ready).map((t) => ({ id: t.href, group: "Tools" as const, title: t.title, hint: t.blurb, icon: t.icon, run: go(t.href) })),
      { id: "/", group: "Pages", title: "Home", hint: "Overview and recent work", icon: "⌂", run: go("/") },
      { id: "/docs", group: "Pages", title: "Docs", hint: "How to use every tool", icon: "§", run: go("/docs") },
      { id: "/author", group: "Pages", title: "Author", hint: "Who built Pipewright", icon: "✎", run: go("/author") },
      { id: "/account", group: "Pages", title: "Account", hint: "Sign in with Google, cloud sync, your data", icon: "◎", run: go("/account") },
      ...DOC_SECTIONS.map((s) => ({ id: `doc:${s.id}`, group: "Docs" as const, title: s.title, hint: s.summary, icon: "§", run: go(`/docs#${s.id}`) })),
      { id: "ai", group: "Actions", title: "AI settings", hint: "Your own key (Claude, GPT, Gemini…), an in-browser model, Ollama, or no AI", icon: "✦", run: openAiSettings },
      {
        id: "theme",
        group: "Actions",
        title: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        hint: "Theme",
        icon: theme === "dark" ? "☀" : "☾",
        run: () => setTheme(theme === "dark" ? "light" : "dark", { x: innerWidth / 2, y: innerHeight / 2 }),
      },
    ];
  }, [router, theme]);

  const results = useMemo(
    () =>
      items
        .map((it) => ({ it, s: Math.max(score(query, it.title) * 2, score(query, `${it.group} ${it.hint}`)) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, query ? 12 : 30)
        .map((x) => x.it),
    [items, query],
  );
  const active = Math.min(cursor, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    it.run();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <button aria-label="Close search" className="absolute inset-0 animate-fade-in bg-night/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="paper relative w-full max-w-xl animate-pop overflow-hidden border border-line shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0 text-coral">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") choose(results[active]);
            }}
            placeholder="Jump to a tool, a docs page or an action…"
            className="font-wide w-full bg-transparent py-4 text-base font-bold text-text placeholder:font-sans placeholder:font-normal placeholder:text-muted focus:outline-none"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${active}` : undefined}
          />
          <kbd className="label shrink-0 border border-line px-1.5 py-0.5 text-muted">Esc</kbd>
        </div>
        <ul ref={listRef} id="palette-results" role="listbox" className="max-h-[56vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches &ldquo;{query}&rdquo;.</li>}
          {results.map((it, i) => {
            const on = i === active;
            const header = i === 0 || results[i - 1].group !== it.group;
            return (
              <li key={it.id} role="presentation">
                {header && <p className="label px-3 pt-3 pb-1 text-muted">{it.group}</p>}
                <button
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={on}
                  data-index={i}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => choose(it)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 ${on ? "bg-ink text-ivory" : "text-text"}`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center border text-sm ${on ? "border-ivory/30 text-coral" : "border-line text-ink"}`}>{it.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{it.title}</span>
                    <span className={`block truncate text-xs ${on ? "text-ivory/70" : "text-muted"}`}>{it.hint}</span>
                  </span>
                  {on && <span className="label text-coral">↵</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
