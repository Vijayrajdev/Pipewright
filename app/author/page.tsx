import type { Metadata } from "next";
import Link from "next/link";
import { author } from "@/lib/author";
import { TOOLS } from "@/lib/tools";
import { Bouquet } from "@/components/home/Bouquet";
import { Marquee, Reveal, RotatingWord } from "@/components/motion";
import { RuleLabel } from "@/components/ui";

export const metadata: Metadata = {
  title: `${author.name} · Author`,
  description: `${author.name}, ${author.role}. ${author.summary}`,
};

const HIRE_ME = `mailto:${author.links.email}?subject=${encodeURIComponent(`Hiring enquiry for ${author.name}`)}`;

const CONTACT = [
  { label: "Email", href: HIRE_ME },
  { label: "LinkedIn", href: author.links.linkedin },
  { label: "GitHub", href: author.links.github },
  { label: "Portfolio", href: author.links.website },
];

export default function AuthorPage() {
  const words = author.name.split(" ");
  // "Vijay Raj C K" → VIJAY / RAJ / C K
  const stacked = words.length > 2 ? [words[0], words[1], words.slice(2).join(" ")] : words;
  const initials = words.map((w) => w[0]).join("");

  return (
    <div>
      {/* ── hero ─────────────────────────────────────────── */}
      <section className="grid min-h-[80vh] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <RuleLabel className="mb-8 max-w-[15rem]">
            The author of Pipewright · {author.location}
          </RuleLabel>
          <h1 className="text-[clamp(3rem,13vw,7rem)] leading-[0.86] font-black uppercase lg:text-[clamp(3.4rem,7.5vw,7rem)]" aria-label={author.name}>
            {stacked.map((w, i) => (
              <span key={w + i} className="mask-line" aria-hidden="true">
                <span className={`block animate-rise ${i === 1 ? "text-outline" : "text-ink"}`} style={{ animationDelay: `${i * 120}ms` }}>
                  {w}
                </span>
              </span>
            ))}
          </h1>
          <p className="mt-8 animate-fade-up font-serif text-3xl text-coral italic [animation-delay:450ms] md:text-4xl">
            <RotatingWord words={author.roles} interval={2400} />
          </p>
          <p className="mt-5 max-w-xl animate-fade-up leading-relaxed text-muted [animation-delay:600ms]">{author.summary}</p>
          <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-3 [animation-delay:750ms]">
            <a
              href={HIRE_ME}
              className="shine label group inline-flex items-center gap-3 bg-ink px-7 py-4 text-[11px] text-ivory transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:bg-ink-deep"
            >
              Hire me <span className="text-coral transition-transform duration-300 group-hover:translate-x-1">→</span>
            </a>
            <a
              href={author.links.resume}
              target="_blank"
              rel="noreferrer"
              className="label group inline-flex items-center gap-3 border border-ink/40 px-7 py-4 text-[11px] text-ink transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:border-ink hover:bg-ink hover:text-ivory"
            >
              Download résumé <span className="text-coral transition-transform duration-300 group-hover:translate-y-0.5">↓</span>
            </a>
          </div>
        </div>

        <div className="relative h-[460px] sm:h-[580px] lg:h-[640px]">
          <div className="paper-blue absolute inset-y-0 right-0 left-[24%] animate-wipe">
            <span className="font-wide text-outline-paper absolute top-6 right-6 animate-fade-in text-7xl font-black opacity-60 [animation-delay:800ms] md:text-8xl">
              {initials}
            </span>
            <RuleLabel tone="paper" className="absolute top-36 right-6 max-w-[10rem] [animation-delay:900ms]">
              {author.headline}
            </RuleLabel>
            <p className="label absolute top-56 right-6 text-right text-cream/70">
              {author.role}
              <br />
              {author.certification}
            </p>
          </div>
          <Bouquet className="absolute bottom-0 -left-[6%] h-full w-[80%]" />
        </div>
      </section>

      {/* ── story ────────────────────────────────────────── */}
      <section className="mt-24">
        <Reveal>
          <h2 className="mb-10 text-4xl leading-[0.95] font-black text-ink uppercase md:text-6xl">
            One <span className="text-outline">trajectory</span>
          </h2>
        </Reveal>
        <div className="grid gap-px bg-line md:grid-cols-3">
          {author.story.map((s, i) => (
            <Reveal key={s.label} delay={i * 120} className="group bg-ivory p-6 transition-colors duration-500 hover:bg-paper md:p-8">
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-5xl text-coral italic">{String(i + 1).padStart(2, "0")}</span>
                <span className="label text-ink">{s.label}</span>
              </div>
              <h3 className="mt-6 text-xl font-black text-ink uppercase">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.text}</p>
              <span className="mt-6 block h-0.5 w-0 bg-coral transition-all duration-700 ease-out-expo group-hover:w-full" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── stack marquee ────────────────────────────────── */}
      <Reveal className="-mx-4 mt-24 border-y border-line py-6 md:-mx-8">
        <Marquee items={author.stack} />
      </Reveal>

      {/* ── contact ──────────────────────────────────────── */}
      <section className="mt-24">
        <Reveal>
          <div className="paper-blue grid gap-10 p-8 md:grid-cols-[1.2fr_1fr] md:p-12">
            <div>
              <RuleLabel tone="paper" className="mb-6">Open a channel</RuleLabel>
              <p className="font-wide text-4xl leading-[0.95] font-black text-cream uppercase md:text-6xl">
                Let&apos;s build
                <br />
                <span className="text-outline-paper">something</span>
                <br />
                <span className="text-coral">together.</span>
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={HIRE_ME} className="shine label group inline-flex items-center gap-3 bg-coral px-7 py-4 text-[11px] text-night transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:bg-coral-deep">
                  Hire me <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </a>
                <a
                  href={author.links.resume}
                  target="_blank"
                  rel="noreferrer"
                  className="label inline-flex items-center gap-3 border border-cream/40 px-7 py-4 text-[11px] text-cream transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:border-cream hover:bg-cream hover:text-night"
                >
                  Download résumé ↓
                </a>
              </div>
            </div>
            <ul className="self-end">
              {CONTACT.map((c) => (
                <li key={c.label} className="border-b border-cream/20">
                  <a href={c.href} target={c.label === "Email" ? undefined : "_blank"} rel="noreferrer" className="group flex items-center justify-between py-4">
                    <span className="font-wide text-2xl font-black text-cream uppercase transition-all duration-300 group-hover:pl-2 group-hover:text-coral">{c.label}</span>
                    <span className="text-coral transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ── what's here ──────────────────────────────────── */}
      <section className="mt-24">
        <Reveal>
          <h2 className="mb-8 text-3xl leading-[0.95] font-black text-ink uppercase md:text-5xl">
            What {words[0]} <span className="text-outline">built</span> here
          </h2>
        </Reveal>
        <div className="grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.filter((t) => t.ready).map((t, i) => (
            <Reveal key={t.href} delay={(i % 3) * 90}>
              <Link href={t.href} className="flood group block h-full border-r border-b border-line p-6 [--flood:var(--color-ink)]">
                <span className="font-serif text-2xl text-coral italic">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 text-lg font-black text-ink uppercase transition-colors duration-500 group-hover:text-ivory">{t.title}</h3>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
