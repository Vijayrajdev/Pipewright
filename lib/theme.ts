"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { THEME_COLORS, THEME_KEY, type Theme } from "./theme-script";

export type { Theme };

const read = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function subscribe(cb: () => void) {
  // the attribute is the single source of truth; watch it
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "light");
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked: theme lasts for this page only */
  }
}

/** Switch theme; where supported, the new theme grows out of (x, y) as a circle. */
export function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduced || !origin) {
    apply(theme);
    return;
  }
  const { x, y } = origin;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const transition = document.startViewTransition(() => flushSync(() => apply(theme)));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 750, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {
      /* transition skipped: the theme is already applied */
    });
}
