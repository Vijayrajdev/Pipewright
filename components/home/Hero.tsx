"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bouquet } from "./Bouquet";
import { RuleLabel } from "../ui";

const SLIDES = [
  { words: ["INFER", "CONVERT", "SHIP"], tag: "Schemas bring more order to data", side: "Every format from one model", href: "/schema", cta: "Open the Schema Builder" },
  { words: ["MODEL", "JOIN", "MAP"], tag: "Many files, one data model", side: "Keys, joins and ER diagrams", href: "/workspace", cta: "Open the Data Model" },
  { words: ["DEDUPE", "MERGE", "TEST"], tag: "The boilerplate, already written", side: "SQL in four dialects", href: "/templates", cta: "Browse the templates" },
];

const DURATION = 6000;

export function Hero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = SLIDES[index];

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), DURATION);
    return () => clearTimeout(t);
  }, [index, paused]);

  return (
    <section
      className="relative grid min-h-[78vh] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* left: label + stacked words */}
      <div className="relative z-10">
        <RuleLabel key={`tag-${index}`} className="mb-8 max-w-[14rem]">
          {slide.tag}
        </RuleLabel>
        <h1 key={`words-${index}`} className="text-[clamp(2.6rem,11vw,5.6rem)] leading-[0.86] font-black uppercase lg:text-[clamp(3rem,6.2vw,5.6rem)]" aria-label={slide.words.join(", ")}>
          {slide.words.map((w, i) => (
            <span key={w} className="mask-line" aria-hidden="true">
              <span
                className={`block animate-rise ${i === 1 ? "text-outline" : "text-ink"}`}
                style={{ animationDelay: `${i * 110}ms` }}
              >
                {w}
              </span>
            </span>
          ))}
        </h1>
        <p className="mt-8 max-w-md animate-fade-up text-lg leading-relaxed text-muted [animation-delay:400ms]">
          Pipewright is your junior data engineer. It drafts schemas, data models, SQL and docs so you can review and
          ship.
        </p>
        <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-4 [animation-delay:550ms]">
          <Link
            key={slide.href}
            href={slide.href}
            className="shine label group inline-flex items-center gap-3 bg-ink px-6 py-3.5 text-[11px] text-ivory transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:bg-ink-deep"
          >
            {slide.cta}
            <span className="text-coral transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
          <Link href="/author" className="label link-grow text-ink">
            Meet the author
          </Link>
        </div>
      </div>

      {/* right: crumpled blue panel with the bouquet overlapping its left edge */}
      <div className="relative h-[460px] sm:h-[560px] lg:h-[640px]">
        <div className="paper-blue absolute inset-y-0 right-0 left-[24%] animate-wipe shadow-[0_40px_80px_-40px_var(--color-ink-deep)]">
          <RuleLabel tone="paper" className="absolute top-20 right-6 max-w-[9rem] [animation-delay:900ms]" key={`side-${index}`}>
            {slide.side}
          </RuleLabel>
          {/* 01 / 03 pager with progress line */}
          <div className="absolute top-6 right-6 flex items-center gap-4 text-cream">
            <span className="label tabular-nums">
              {String(index + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
            </span>
            <div className="relative h-px w-24 bg-cream/30">
              <span
                key={`bar-${index}-${paused}`}
                className="absolute inset-0 origin-left animate-progress bg-cream"
                style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? "paused" : "running" }}
              />
            </div>
            <div className="flex gap-1">
              {SLIDES.map((s, i) => (
                <button
                  key={s.href}
                  onClick={() => setIndex(i)}
                  aria-label={`Show slide ${i + 1}`}
                  className={`h-2 w-2 rounded-full transition-all duration-300 ${i === index ? "w-5 bg-coral" : "bg-cream/50 hover:bg-cream"}`}
                />
              ))}
            </div>
          </div>
        </div>
        <Bouquet className="absolute bottom-0 -left-[6%] h-full w-[80%]" />
      </div>
    </section>
  );
}
