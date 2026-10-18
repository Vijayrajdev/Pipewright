import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "accent" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-ivory hover:bg-ink-deep",
  accent: "bg-coral text-night hover:bg-coral-deep hover:text-night",
  ghost: "border border-ink/30 bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-ivory",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`shine label inline-flex items-center justify-center gap-2 rounded-none px-4 py-2.5 text-[11px] transition-all duration-300 ease-out-expo hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`paper animate-pop border border-line p-5 md:p-6 ${className}`}>{children}</section>;
}

export function SectionTitle({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <h2 className="mb-4 flex items-baseline gap-3 text-lg font-extrabold text-ink uppercase">
      {index && <span className="font-serif text-xl font-normal text-coral normal-case italic">{index}</span>}
      {children}
    </h2>
  );
}

/** Small caps label with the vertical rule from the BLOOM reference. */
export function RuleLabel({ children, className = "", tone = "ink" }: { children: ReactNode; className?: string; tone?: "ink" | "paper" }) {
  return (
    <p
      className={`label animate-fade-in border-l pl-3 ${tone === "paper" ? "border-cream/60 text-cream/80" : "border-ink/60 text-ink"} ${className}`}
    >
      {children}
    </p>
  );
}

export function PageHeader({
  eyebrow,
  title,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  /** a second line, set in outline type */
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        <RuleLabel className="mb-5 max-w-[16rem]">{eyebrow}</RuleLabel>
        <h1 className="text-[clamp(2.2rem,6vw,4.6rem)] leading-[0.92] font-black text-ink uppercase">
          <span className="mask-line">
            <span className="block animate-rise">{title}</span>
          </span>
          {accent && (
            <span className="mask-line">
              <span className="outline-fill block animate-rise [animation-delay:120ms]">{accent}</span>
            </span>
          )}
        </h1>
      </div>
      {children && (
        <div className="max-w-md animate-fade-up text-base leading-relaxed text-muted [animation-delay:300ms] md:pb-2">{children}</div>
      )}
    </header>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  const styles = tone === "error" ? "border-coral bg-coral-soft text-text" : "border-ink/30 bg-ink-soft/60 text-ink-deep";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`animate-pop border-l-4 px-4 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/** Pill tabs used across tools. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 border-b border-line">
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={`label relative -mb-px pb-2.5 transition-colors ${t.id === value ? "text-ink" : "text-muted hover:text-ink"}`}
        >
          {t.label}
          <span
            className={`absolute bottom-0 left-0 h-0.5 w-full origin-left bg-coral transition-transform duration-500 ease-out-expo ${
              t.id === value ? "scale-x-100" : "scale-x-0"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
