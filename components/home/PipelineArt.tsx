/** Animated diagram: inputs flow into Pipewright and out to every target. */
const INPUTS = ["CSV", "JSON", "DDL", "Avro"];
const OUTPUTS = ["BigQuery", "Snowflake", "Postgres", "Spark", "dbt"];

const W = 520;
const H = 300;
const HUB = { x: W / 2, y: H / 2 };

function curve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

export function PipelineArt() {
  const inY = (i: number) => 40 + i * ((H - 80) / (INPUTS.length - 1));
  const outY = (i: number) => 30 + i * ((H - 60) / (OUTPUTS.length - 1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Inputs such as CSV and JSON flow through Pipewright into BigQuery, Snowflake, Postgres, Spark and dbt">
      <defs>
        <linearGradient id="pipe-in" x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-ink)" stopOpacity="0.15" />
          <stop offset="1" stopColor="var(--color-ink)" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="pipe-out" x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-coral)" stopOpacity="0.8" />
          <stop offset="1" stopColor="var(--color-coral)" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id="hub-glow">
          <stop offset="0" stopColor="var(--color-coral)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--color-coral)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* pipes */}
      {INPUTS.map((_, i) => {
        const d = curve(70, inY(i), HUB.x - 44, HUB.y);
        return (
          <g key={`in-${i}`}>
            <path d={d} fill="none" stroke="url(#pipe-in)" strokeWidth="3" />
            <path d={d} fill="none" stroke="var(--color-ink)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 22" className="animate-flow" style={{ animationDuration: `${1.2 + i * 0.25}s` }} />
          </g>
        );
      })}
      {OUTPUTS.map((_, i) => {
        const d = curve(HUB.x + 44, HUB.y, W - 92, outY(i));
        return (
          <g key={`out-${i}`}>
            <path d={d} fill="none" stroke="url(#pipe-out)" strokeWidth="3" />
            <path d={d} fill="none" stroke="var(--color-coral-deep)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 22" className="animate-flow" style={{ animationDuration: `${1 + i * 0.2}s` }} />
          </g>
        );
      })}

      {/* hub */}
      <circle cx={HUB.x} cy={HUB.y} r="80" fill="url(#hub-glow)" className="origin-center animate-pulse transform-fill" />
      <g className="origin-center animate-spin-slow transform-fill">
        <circle cx={HUB.x} cy={HUB.y} r="54" fill="none" stroke="var(--color-ink)" strokeOpacity="0.35" strokeDasharray="4 8" />
      </g>
      <rect x={HUB.x - 42} y={HUB.y - 42} width="84" height="84" rx="22" fill="var(--color-ink)" />
      <path
        d={`M${HUB.x - 20},${HUB.y - 10}h16a8 8 0 0 1 8 8v22`}
        fill="none"
        stroke="var(--color-ivory)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x={HUB.x - 7} y={HUB.y - 16} width="12" height="12" rx="2.5" fill="var(--color-coral)" />

      {/* labels */}
      {INPUTS.map((label, i) => (
        <g key={label} className="animate-float" style={{ animationDelay: `${i * 0.4}s`, transformBox: "fill-box" }}>
          <rect x="6" y={inY(i) - 13} width="64" height="26" rx="13" fill="var(--color-paper)" stroke="var(--color-line)" />
          <text x="38" y={inY(i) + 4.5} textAnchor="middle" className="fill-ink font-label text-[12px] font-semibold">
            {label}
          </text>
        </g>
      ))}
      {OUTPUTS.map((label, i) => (
        <g key={label} className="animate-float" style={{ animationDelay: `${0.2 + i * 0.35}s`, transformBox: "fill-box" }}>
          <rect x={W - 92} y={outY(i) - 13} width="86" height="26" rx="13" fill="var(--color-coral-soft)" stroke="var(--color-coral)" strokeOpacity="0.5" />
          <text x={W - 49} y={outY(i) + 4.5} textAnchor="middle" className="fill-text font-label text-[12px] font-semibold">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
