"use client";

import { useId } from "react";
import { setTheme, useTheme } from "@/lib/theme";

/**
 * Sun ⇄ moon switch. The sun's rays spin away and a shadow slides across the
 * disc to carve the crescent; the page itself switches with a circular reveal.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const dark = theme === "dark";
  const maskId = `moon-${useId().replace(/:/g, "")}`;

  return (
    <button
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTheme(dark ? "light" : "dark", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`group relative grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition-all duration-500 ease-out-expo hover:border-coral hover:text-coral active:scale-90 ${className}`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className={`transition-transform duration-700 ease-spring ${dark ? "rotate-[-40deg]" : "rotate-0"}`}>
        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          {/* the shadow that slides in to turn the sun into a crescent */}
          <circle
            cx="17"
            cy="7"
            r="6.5"
            fill="black"
            className="transition-transform duration-700 ease-out-expo"
            style={{ transform: dark ? "translate(0, 0)" : "translate(9px, -9px)" }}
          />
        </mask>
        {/* mask on an untransformed group, so the cut stays put while the disc grows */}
        <g mask={`url(#${maskId})`}>
          <circle
            cx="12"
            cy="12"
            r="5"
            fill="currentColor"
            className="origin-center transition-transform duration-700 ease-spring transform-fill"
            style={{ transform: dark ? "scale(1.75)" : "scale(1)" }}
          />
        </g>
        {/* rays */}
        <g
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="origin-center transition-all duration-500 ease-out-expo transform-fill"
          style={{ transform: dark ? "rotate(90deg) scale(0.4)" : "rotate(0deg) scale(1)", opacity: dark ? 0 : 1 }}
        >
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="12" y1="1.5" x2="12" y2="3.8" transform={`rotate(${a} 12 12)`} />
          ))}
        </g>
      </svg>
      {/* a coral spark that blooms on hover */}
      <span className="pointer-events-none absolute inset-0 scale-50 rounded-full bg-coral/15 opacity-0 transition-all duration-500 group-hover:scale-110 group-hover:opacity-100" />
    </button>
  );
}
