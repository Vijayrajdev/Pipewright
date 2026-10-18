/**
 * Pipewright mark: a pipe elbow with data flowing through it and a coral rose
 * blooming from its outlet (the hero's "pipeline bouquet" in one glyph).
 * Wordmark: PIPE solid + WRIGHT in outline, echoing the BLOOM-style headline.
 * The same artwork is the favicon (app/icon.svg).
 */

const PETALS = [0, 60, 120, 180, 240, 300];

export function LogoMark({ size = 32, tile = false, className = "" }: { size?: number; tile?: boolean; className?: string }) {
  // on a tile the pipe is cream on blue; standalone it's blue on the page
  const pipe = tile ? "var(--color-cream)" : "var(--color-ink)";
  const flow = tile ? "var(--color-panel)" : "var(--color-ivory)";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      {tile && <rect width="48" height="48" rx="12" fill="var(--color-panel)" />}
      {/* pipe elbow */}
      <path d="M7 36 H20 a9 9 0 0 0 9 -9 V20" fill="none" stroke={pipe} strokeWidth="7" strokeLinecap="round" />
      {/* data flowing toward the bloom */}
      <path d="M7 36 H20 a9 9 0 0 0 9 -9 V20" fill="none" stroke={flow} strokeWidth="2" strokeLinecap="round" strokeDasharray="1.5 6" className="animate-flow" />
      {/* inlet collar */}
      <rect x="9.5" y="31" width="4" height="10" rx="1.5" fill="var(--color-coral)" />
      {/* the bloom: opens on load, spins a petal on hover */}
      <g className="origin-center transition-transform duration-700 ease-spring transform-fill group-hover:scale-110 group-hover:rotate-60">
        <g className="origin-center animate-bloom transform-fill">
          {PETALS.map((a) => (
            <ellipse key={a} cx="29" cy="7.6" rx="3.3" ry="4.4" fill="var(--color-coral)" transform={`rotate(${a} 29 12)`} />
          ))}
          <circle cx="29" cy="12" r="3.2" fill="var(--color-coral-deep)" />
          <circle cx="29" cy="12" r="1.2" fill="var(--color-cream)" />
        </g>
      </g>
    </svg>
  );
}

export function Logo({ className = "", size = 30, tagline = false }: { className?: string; size?: number; tagline?: boolean }) {
  return (
    <span className={`group inline-flex items-center gap-2.5 ${className}`}>
      <span className="transition-transform duration-500 ease-spring group-hover:-rotate-6">
        <LogoMark size={size} />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-wide font-black tracking-tight uppercase" style={{ fontSize: Math.round(size * 0.6) }}>
          <span className="text-ink">Pipe</span>
          {/* outline letters fill with ink on hover */}
          <span className="text-transparent transition-colors duration-500 [-webkit-text-stroke:1.2px_var(--color-ink)] group-hover:text-ink">wright</span>
        </span>
        {tagline && <span className="label mt-1.5 text-[9px] text-muted">Your junior data engineer</span>}
      </span>
    </span>
  );
}
