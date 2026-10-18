"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/useMediaQuery";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fades content up the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`} style={{ "--delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Splits a headline into words that rise in one after another. */
export function SplitWords({ text, className = "", startDelay = 0 }: { text: string; className?: string; startDelay?: number }) {
  return (
    <span className={className}>
      {text.split(" ").map((word, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <span className="inline-block animate-fade-up" style={{ animationDelay: `${startDelay + i * 70}ms` }}>
            {word}&nbsp;
          </span>
        </span>
      ))}
    </span>
  );
}

/** Cycles through words with a vertical slide. */
export function RotatingWord({ words, interval = 2200, className = "" }: { words: string[]; interval?: number; className?: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval]);

  return (
    <span className={`relative inline-grid overflow-hidden align-bottom ${className}`}>
      {/* invisible longest word reserves the width so the line doesn't jump */}
      <span className="invisible col-start-1 row-start-1">{words.reduce((a, b) => (b.length > a.length ? b : a))}</span>
      {words.map((w, i) => (
        <span
          key={w}
          aria-hidden={i !== index}
          className="col-start-1 row-start-1 transition-all duration-700 ease-out-expo"
          style={{
            transform: `translateY(${i === index ? 0 : i === (index - 1 + words.length) % words.length ? -110 : 110}%)`,
            opacity: i === index ? 1 : 0,
          }}
        >
          {w}
        </span>
      ))}
    </span>
  );
}

/** Counts from 0 to `to` once visible. */
export function CountUp({ to, duration = 1400, suffix = "" }: { to: number; duration?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        setValue(Math.round(to * (1 - Math.pow(1 - p, 4))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration, reduced]);

  return (
    <span ref={ref} className="tabular-nums">
      {reduced ? to : value}
      {suffix}
    </span>
  );
}

/** Card that tilts toward the cursor and shows a coral spotlight. */
export function TiltCard({ children, className = "", max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateY(-4px)`;
  }
  function onLeave() {
    if (ref.current) ref.current.style.transform = "";
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`spotlight transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}

/** Types lines out character by character, then loops. */
export function Typewriter({ lines, speed = 22, pause = 2600 }: { lines: { text: string; className?: string }[]; speed?: number; pause?: number }) {
  const full = lines.map((l) => l.text).join("\n");
  const [typed, setCount] = useState(0);
  const reduced = useReducedMotion();
  const count = reduced ? full.length : typed;

  useEffect(() => {
    if (reduced) return;
    let t: ReturnType<typeof setTimeout>;
    const step = (n: number) => {
      setCount(n);
      if (n < full.length) t = setTimeout(() => step(n + 1), full[n] === "\n" ? speed * 8 : speed);
      else t = setTimeout(() => step(0), pause);
    };
    step(0);
    return () => clearTimeout(t);
  }, [full, speed, pause, reduced]);

  // character offset where each line starts in `full`
  const starts = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + l.text.length + 1, 0));
  return (
    <>
      {lines.map((line, i) => {
        const remaining = count - starts[i];
        const shown = line.text.slice(0, Math.max(0, remaining));
        const isCurrent = remaining >= 0 && remaining <= line.text.length;
        if (!shown && !isCurrent) return null;
        return (
          <div key={i} className={line.className}>
            {shown}
            {isCurrent && <span className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.15em] animate-blink bg-coral" />}
          </div>
        );
      })}
    </>
  );
}

/** Infinite ticker of giant outline words; hovered words fill with ink. */
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="flex w-max animate-marquee items-center gap-8 hover:[animation-play-state:paused]">
        {row.map((item, i) => (
          <span key={i} aria-hidden={i >= items.length} className="flex items-center gap-8">
            <span className="font-wide outline-fill text-5xl font-black whitespace-nowrap uppercase md:text-7xl">{item}</span>
            <span className="text-3xl text-coral">✺</span>
          </span>
        ))}
      </div>
    </div>
  );
}
