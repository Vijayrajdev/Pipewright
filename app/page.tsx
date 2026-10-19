import Link from "next/link";
import { TOOLS } from "@/lib/tools";
import { OUTPUT_FORMATS } from "@/lib/schema/emitters";
import { TEMPLATES, DIALECTS } from "@/lib/templates";
import { RecentWork } from "@/components/RecentWork";
import { Hero } from "@/components/home/Hero";
import { PipelineArt } from "@/components/home/PipelineArt";
import { LiveDemo } from "@/components/home/LiveDemo";
import { CountUp, Marquee, Reveal, TiltCard } from "@/components/motion";
import { RuleLabel } from "@/components/ui";

const TARGETS = ["BigQuery", "Snowflake", "Postgres", "Databricks", "Delta Lake", "PySpark", "Avro", "JSON Schema", "dbt", "Mermaid", "DBML", "CSV"];

const STATS = [
  { value: OUTPUT_FORMATS.length, label: "Schema formats" },
  { value: TEMPLATES.length, label: "SQL templates" },
  { value: DIALECTS.length, label: "SQL dialects" },
  { value: TOOLS.filter((t) => t.ready).length, label: "Tools ready" },
];

export default function Home() {
  return (
    <div>
      <Hero />

      {/* ── outline marquee ─────────────────────────────────── */}
      <Reveal className="-mx-4 mt-10 border-y border-line py-6 md:-mx-8">
        <Marquee items={TARGETS} />
      </Reveal>

      {/* ── stats ───────────────────────────────────────────── */}
      <section className="mt-20 grid grid-cols-2 border-t border-l border-line md:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 90} className="flood group border-r border-b border-line p-6 [--flood:var(--color-ink)]">
            <p className="font-wide text-6xl font-black text-ink transition-colors duration-500 group-hover:text-coral">
              <CountUp to={s.value} />
            </p>
            <p className="label mt-2 text-muted transition-colors duration-500 group-hover:text-ivory">{s.label}</p>
          </Reveal>
        ))}
      </section>

      {/* ── how it flows ────────────────────────────────────── */}
      <section className="mt-24 grid items-center gap-10 lg:grid-cols-[1fr_1.15fr]">
        <Reveal>
          <RuleLabel className="mb-6 max-w-[14rem]">How it works</RuleLabel>
          <h2 className="text-4xl leading-[0.95] font-black text-ink uppercase md:text-5xl">
            One model in,
            <br />
            <span className="text-outline">every format</span>
            <br />
            out.
          </h2>
          <p className="mt-6 max-w-md text-muted">
            Every input becomes one canonical schema, and every output is generated from it. Rules do the predictable
            work, so you get the same answer every time with no API calls.
          </p>
          <div className="mt-8">
            <LiveDemo />
          </div>
        </Reveal>
        <Reveal delay={150}>
          <div className="paper-blue relative p-6 md:p-10">
            <div className="bg-ivory/95 p-4 md:p-6">
              <PipelineArt />
            </div>
            <RuleLabel tone="paper" className="mt-6">
              Inputs on the left · targets on the right
            </RuleLabel>
          </div>
        </Reveal>
      </section>

      {/* ── toolbox ─────────────────────────────────────────── */}
      <section className="mt-24">
        <Reveal>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-4xl leading-[0.95] font-black text-ink uppercase md:text-6xl">
              The <span className="text-outline">toolbox</span>
            </h2>
            <RuleLabel className="max-w-[16rem]">Free and local. Claude or a local model when you want AI</RuleLabel>
          </div>
        </Reveal>
        <div className="grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool, i) => {
            const num = String(i + 1).padStart(2, "0");
            const body = (
              <>
                <div className="flex items-start justify-between">
                  <span className="font-serif text-3xl text-coral italic transition-colors duration-500 group-hover:text-coral">{num}</span>
                  {tool.ready ? (
                    <span className="label translate-x-2 text-coral opacity-0 transition-all duration-500 group-hover:translate-x-0 group-hover:opacity-100">
                      Open →
                    </span>
                  ) : (
                    <span className="label text-muted">Soon</span>
                  )}
                </div>
                <h3 className="mt-6 text-xl font-black text-ink uppercase transition-colors duration-500 group-hover:text-ivory">{tool.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted transition-colors duration-500 group-hover:text-ivory/80">{tool.blurb}</p>
              </>
            );
            return (
              <Reveal key={tool.title} delay={(i % 3) * 90}>
                {tool.ready ? (
                  <TiltCard max={4} className="h-full">
                    <Link href={tool.href} className="flood group block h-full border-r border-b border-line p-6 [--flood:var(--color-ink)]">
                      {body}
                    </Link>
                  </TiltCard>
                ) : (
                  <div className="group h-full border-r border-b border-line bg-surface/50 p-6 opacity-70">{body}</div>
                )}
              </Reveal>
            );
          })}
          {/* last tile: the manual */}
          <Reveal delay={(TOOLS.length % 3) * 90}>
            <TiltCard max={4} className="h-full">
              <Link href="/docs" className="group flex h-full flex-col justify-between border-r border-b border-line bg-coral p-6 text-night transition-colors duration-500 hover:bg-coral-deep">
                <div className="flex items-start justify-between">
                  <span className="font-serif text-3xl italic">§</span>
                  <span className="label translate-x-2 opacity-0 transition-all duration-500 group-hover:translate-x-0 group-hover:opacity-100">Read →</span>
                </div>
                <div>
                  <h3 className="mt-6 text-xl font-black uppercase">New here? Read the docs</h3>
                  <p className="mt-2 text-sm leading-relaxed text-night/80">A five-minute tour, then every tool explained step by step, with tips and answers to common questions.</p>
                </div>
              </Link>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* ── recent + quote ──────────────────────────────────── */}
      <section className="mt-24 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Reveal>
          <div className="paper h-full border border-line p-6">
            <RuleLabel className="mb-4">Recent work</RuleLabel>
            <RecentWork />
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="paper-blue flex h-full flex-col justify-between gap-6 p-8">
            <p className="font-serif text-3xl leading-tight text-cream italic md:text-4xl">
              &ldquo;Rules for the routine, AI for the rest, and a human for the final call.&rdquo;
            </p>
            <Link href="/author" className="label link-grow self-start text-coral">
              About the author →
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
