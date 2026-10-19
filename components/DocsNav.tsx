"use client";

import { useEffect, useState } from "react";
import { DOC_SECTIONS } from "@/lib/docs";

/** Sticky table of contents that follows the reader down the page. */
export function DocsNav() {
  const [active, setActive] = useState<string>(DOC_SECTIONS[0].id);

  useEffect(() => {
    const els = DOC_SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // a band near the top of the viewport decides which section is "current"
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  return (
    <nav aria-label="Documentation" className="lg:sticky lg:top-24">
      <p className="label mb-3 text-muted">On this page</p>
      <ol className="space-y-0.5 border-l border-line">
        {DOC_SECTIONS.map((s, i) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={`-ml-px flex items-baseline gap-2 border-l-2 py-1 pl-3 text-sm transition-all duration-300 ${
                  on ? "border-coral font-semibold text-ink" : "border-transparent text-muted hover:border-ink/40 hover:text-ink"
                }`}
              >
                <span className={`font-mono text-[10px] ${on ? "text-coral-deep" : "text-muted/70"}`}>{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
