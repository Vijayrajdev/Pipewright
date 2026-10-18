"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentSchema, useRecent } from "@/lib/store";

const LEAVE_MS = 350;

export function RecentWork() {
  const [items, , forget, clear] = useRecent();
  const [, setSchema] = useCurrentSchema();
  const router = useRouter();
  // names currently animating out; removed from the store once the animation ends
  const [leaving, setLeaving] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  function remove(name: string) {
    setLeaving((l) => [...l, name]);
    setTimeout(() => {
      forget(name);
      setLeaving((l) => l.filter((n) => n !== name));
    }, LEAVE_MS);
  }

  if (items.length === 0) {
    return <p className="animate-fade-in text-sm text-muted">Nothing yet. Schemas you save in the Schema Builder show up here.</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {items.map((item, i) => {
          const out = leaving.includes(item.name);
          return (
            <li
              key={item.name}
              className={`group grid animate-row-in transition-all ease-out-expo ${out ? "translate-x-8 grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"}`}
              style={{ animationDelay: `${i * 50}ms`, transitionDuration: `${LEAVE_MS}ms` }}
            >
              <div className="flex min-h-0 items-center gap-2 overflow-hidden">
                <button
                  onClick={() => {
                    setSchema(item.schema);
                    router.push("/schema");
                  }}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-left transition-colors hover:text-ink"
                >
                  <span className="truncate font-mono text-sm">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {item.columns} cols · {new Date(item.savedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  onClick={() => remove(item.name)}
                  aria-label={`Delete ${item.name} from recent work`}
                  title="Delete"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted opacity-60 transition-all duration-300 group-hover:opacity-100 hover:rotate-90 hover:bg-coral hover:text-night focus-visible:opacity-100"
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-end gap-3">
        {confirmClear ? (
          <span className="flex animate-fade-in items-center gap-3">
            <span className="label text-muted">Delete all {items.length}?</span>
            <button
              onClick={() => {
                items.forEach((it) => setLeaving((l) => [...l, it.name]));
                setTimeout(() => {
                  clear();
                  setLeaving([]);
                  setConfirmClear(false);
                }, LEAVE_MS);
              }}
              className="label link-grow text-coral-deep"
            >
              Yes, clear
            </button>
            <button onClick={() => setConfirmClear(false)} className="label link-grow text-ink">
              Cancel
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmClear(true)} className="label link-grow text-muted hover:text-coral-deep">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
