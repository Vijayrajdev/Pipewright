/**
 * A spray-rose bouquet in the brand coral, after the BLOOM reference.
 *
 * Every flower, bud, leaf and thorn is positioned by evaluating the cubic
 * curve of the stem it grows from, so nothing floats off its stem. All
 * coordinates are rounded so server and client render identical markup.
 */

type P = [number, number];
const r2 = (n: number) => Math.round(n * 100) / 100;

function bez(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** Direction of travel along the curve at t, in degrees (0 = +x). */
function angleAt(p0: P, p1: P, p2: P, p3: P, t: number): number {
  const u = 1 - t;
  const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
  const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

interface Stem {
  pts: [P, P, P, P];
  width: number;
  flower?: { kind: "rose" | "bud"; size: number; rot: number };
}

// ── composition (viewBox 520 × 640, stems gathered at the bottom centre) ──

const MAIN: Stem[] = [
  { pts: [[248, 640], [244, 520], [172, 360], [140, 205]], width: 5, flower: { kind: "rose", size: 62, rot: 12 } },
  { pts: [[252, 640], [252, 500], [276, 300], [282, 118]], width: 5.5, flower: { kind: "rose", size: 72, rot: -14 } },
  { pts: [[256, 640], [262, 520], [380, 400], [410, 258]], width: 5, flower: { kind: "rose", size: 60, rot: 28 } },
];

/** branch: grows from `parent` at `t`; c1 is relative to that point */
const BRANCHES: { parent: number; t: number; c1: P; c2: P; to: P; width: number; flower: Stem["flower"] }[] = [
  { parent: 0, t: 0.45, c1: [-28, -18], c2: [84, 330], to: [64, 300], width: 3.4, flower: { kind: "rose", size: 44, rot: 40 } },
  { parent: 2, t: 0.55, c1: [40, -4], c2: [478, 404], to: [478, 372], width: 3.2, flower: { kind: "rose", size: 38, rot: -22 } },
  { parent: 2, t: 0.28, c1: [36, -10], c2: [352, 500], to: [362, 470], width: 3, flower: { kind: "rose", size: 32, rot: 8 } },
  { parent: 1, t: 0.62, c1: [26, -30], c2: [380, 176], to: [392, 126], width: 2.6, flower: { kind: "bud", size: 20, rot: 0 } },
  { parent: 1, t: 0.8, c1: [-24, -20], c2: [204, 112], to: [190, 70], width: 2.4, flower: { kind: "bud", size: 18, rot: 0 } },
  { parent: 0, t: 0.76, c1: [-24, -14], c2: [64, 182], to: [46, 150], width: 2.4, flower: { kind: "bud", size: 14, rot: 0 } },
  { parent: 0, t: 0.22, c1: [-30, -8], c2: [142, 482], to: [118, 470], width: 2.2, flower: { kind: "bud", size: 13, rot: 0 } },
  { parent: 1, t: 0.42, c1: [22, -28], c2: [328, 262], to: [340, 222], width: 2.2, flower: { kind: "bud", size: 12, rot: 0 } },
];

const LEAVES: { stem: number; t: number; side: 1 | -1; len: number }[] = [
  { stem: 0, t: 0.32, side: 1, len: 46 },
  { stem: 0, t: 0.58, side: -1, len: 40 },
  { stem: 1, t: 0.25, side: -1, len: 50 },
  { stem: 1, t: 0.5, side: 1, len: 44 },
  { stem: 1, t: 0.72, side: -1, len: 36 },
  { stem: 2, t: 0.2, side: 1, len: 48 },
  { stem: 2, t: 0.42, side: -1, len: 42 },
  { stem: 2, t: 0.7, side: 1, len: 34 },
  { stem: 3, t: 0.55, side: 1, len: 30 },
  { stem: 4, t: 0.5, side: -1, len: 28 },
  { stem: 5, t: 0.5, side: 1, len: 26 },
];

/** Resolve branches into absolute stems. Index order: MAIN then BRANCHES. */
const STEMS: Stem[] = [
  ...MAIN,
  ...BRANCHES.map((b) => {
    const p = MAIN[b.parent].pts;
    const from = bez(p[0], p[1], p[2], p[3], b.t);
    return { pts: [from, [from[0] + b.c1[0], from[1] + b.c1[1]], b.c2, b.to] as [P, P, P, P], width: b.width, flower: b.flower };
  }),
];

const stemPath = ([a, b, c, d]: Stem["pts"]) =>
  `M${r2(a[0])},${r2(a[1])} C${r2(b[0])},${r2(b[1])} ${r2(c[0])},${r2(c[1])} ${r2(d[0])},${r2(d[1])}`;

// ── shapes ───────────────────────────────────────────────────────────────

/** Rounded rose petal pointing up (−y) from the origin, with a soft notch at the tip. */
function petal(L: number, W: number) {
  const n = (v: number) => r2(v);
  return `M0,0 C${n(W * 0.55)},${n(-L * 0.1)} ${n(W)},${n(-L * 0.55)} ${n(W * 0.55)},${n(-L * 0.92)} Q${n(W * 0.25)},${n(-L * 1.04)} 0,${n(-L * 0.94)} Q${n(-W * 0.25)},${n(-L * 1.04)} ${n(-W * 0.55)},${n(-L * 0.92)} C${n(-W)},${n(-L * 0.55)} ${n(-W * 0.55)},${n(-L * 0.1)} 0,0 Z`;
}

/** Narrow pointed sepal / bud wrapper. */
function sepal(L: number, W: number) {
  return `M0,0 C${r2(W)},${r2(-L * 0.3)} ${r2(W * 0.4)},${r2(-L * 0.8)} 0,${r2(-L)} C${r2(-W * 0.4)},${r2(-L * 0.8)} ${r2(-W)},${r2(-L * 0.3)} 0,0 Z`;
}

/** Serrated leaf pointing along +x from the origin. */
function leafPath(L: number) {
  const W = L * 0.34;
  const N = 7;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let k = 1; k <= N; k++) {
    const t = k / (N + 1);
    const w = W * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.8);
    const tip = (t + 0.45 / (N + 1)) * L;
    top.push(`L${r2(t * L)},${r2(-w * 0.86)} L${r2(tip)},${r2(-w)}`);
    bottom.unshift(`L${r2(tip)},${r2(w)} L${r2(t * L)},${r2(w * 0.86)}`);
  }
  return `M0,0 ${top.join(" ")} L${r2(L)},0 ${bottom.join(" ")} Z`;
}

function leafVeins(L: number) {
  const out: string[] = [];
  for (let k = 1; k <= 5; k++) {
    const x = (k / 6.5) * L;
    const w = L * 0.24 * Math.sin((Math.PI * k) / 6.5);
    out.push(`M${r2(x)},0 Q${r2(x + w * 0.5)},${r2(-w * 0.3)} ${r2(x + w)},${r2(-w)}`);
    out.push(`M${r2(x)},0 Q${r2(x + w * 0.5)},${r2(w * 0.3)} ${r2(x + w)},${r2(w)}`);
  }
  return out.join(" ");
}

const ring = (count: number, offset: number) => Array.from({ length: count }, (_, i) => r2(offset + (i * 360) / count));

/** Deterministic 0–1 jitter from integers (no Math.sin, so server and client agree exactly). */
const jitter = (a: number, b: number, c = 0) => (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) >>> 0) % 1000 / 1000;

function Rose({ size: R, rot, delay, seed }: { size: number; rot: number; delay: number; seed: number }) {
  const layers = [
    { n: 7, L: R, W: R * 0.52, off: 0, fill: "url(#bq-petal-outer)", d: 360 },
    { n: 6, L: R * 0.8, W: R * 0.44, off: 26, fill: "url(#bq-petal-mid)", d: 240 },
    { n: 5, L: R * 0.58, W: R * 0.34, off: 8, fill: "url(#bq-petal-inner)", d: 130 },
    { n: 4, L: R * 0.38, W: R * 0.24, off: 45, fill: "url(#bq-petal-core)", d: 40 },
  ];
  return (
    // a slight squash reads as the bloom tilting toward the viewer
    <g transform={`rotate(${rot}) scale(1 0.86)`}>
      <g className="origin-center animate-unfurl transform-fill" style={{ animationDelay: `${delay}ms` }}>
        {/* sepals, mostly hidden behind the outer petals */}
        {ring(5, 18).map((a, i) => (
          <path key={`s${a}`} d={sepal(R * (1.02 + jitter(seed, i, 9) * 0.1), R * 0.11)} transform={`rotate(${a})`} fill="url(#bq-leaf)" />
        ))}
        {/* petal rings, outside in, each opening a beat after the last inner one */}
        {layers.map((l, li) => (
          <g key={li} className="origin-center animate-bloom transform-fill" style={{ animationDelay: `${delay + l.d}ms` }}>
            {ring(l.n, l.off).map((a, pi) => {
              // no two petals alike: vary length, width and angle a little
              const k = 0.86 + jitter(seed, li, pi) * 0.28;
              const L = l.L * k;
              const W = l.W * (0.9 + jitter(pi, seed, li) * 0.2);
              const ang = r2(a + (jitter(li, pi, seed) - 0.5) * 12);
              return (
              <g key={a} transform={`rotate(${ang}) translate(0 ${r2(-li * R * 0.03)})`}>
                <path d={petal(L, W)} fill={l.fill} stroke="#a9471f" strokeOpacity="0.35" strokeWidth="0.6" />
                {li < 2 && (
                  // rolled-back petal edge catching the light
                  <path
                    d={`M${r2(-W * 0.45)},${r2(-L * 0.88)} Q0,${r2(-L * 1.0)} ${r2(W * 0.45)},${r2(-L * 0.88)}`}
                    fill="none"
                    stroke="#fcd5c0"
                    strokeOpacity="0.7"
                    strokeWidth={r2(Math.max(0.8, R * 0.025))}
                    strokeLinecap="round"
                  />
                )}
                {li === 0 && (
                  // soft crease down the middle of outer petals
                  <path d={`M0,${r2(-L * 0.15)} Q${r2(W * 0.08)},${r2(-L * 0.5)} 0,${r2(-L * 0.8)}`} fill="none" stroke="#c4562a" strokeOpacity="0.25" strokeWidth="0.8" />
                )}
              </g>
              );
            })}
          </g>
        ))}
        {/* tight spiral at the heart */}
        <circle r={r2(R * 0.13)} fill="#a8441d" />
        <path
          d={`M${r2(-R * 0.1)},0 A${r2(R * 0.1)},${r2(R * 0.1)} 0 1 1 ${r2(R * 0.06)},${r2(R * 0.07)} M${r2(-R * 0.04)},${r2(-R * 0.02)} A${r2(R * 0.05)},${r2(R * 0.05)} 0 1 0 ${r2(R * 0.05)},${r2(-R * 0.03)}`}
          fill="none"
          stroke="#f39a72"
          strokeWidth={r2(Math.max(0.7, R * 0.02))}
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

function Bud({ size: S, angle, delay }: { size: number; angle: number; delay: number }) {
  // buds point along the stem; shapes are drawn pointing up, so rotate by angle + 90
  return (
    <g transform={`rotate(${r2(angle + 90)})`}>
      <g className="origin-bottom animate-unfurl transform-fill" style={{ animationDelay: `${delay}ms` }}>
        <path d={sepal(S * 1.9, S * 0.62)} fill="url(#bq-petal-mid)" stroke="#a9471f" strokeOpacity="0.35" strokeWidth="0.6" />
        <path d={`M${r2(-S * 0.25)},${r2(-S * 0.5)} Q${r2(S * 0.1)},${r2(-S * 1.2)} ${r2(S * 0.05)},${r2(-S * 1.75)}`} fill="none" stroke="#fcd5c0" strokeOpacity="0.6" strokeWidth="0.9" strokeLinecap="round" />
        {[-28, 0, 28].map((a) => (
          <path key={a} d={sepal(S * 1.15, S * 0.22)} transform={`rotate(${a})`} fill="url(#bq-leaf)" />
        ))}
      </g>
    </g>
  );
}

function Leaflet({ len }: { len: number }) {
  return (
    <g>
      <path d={leafPath(len)} fill="url(#bq-leaf)" stroke="#a9471f" strokeOpacity="0.4" strokeWidth="0.5" strokeLinejoin="round" />
      <path d={`M0,0 L${r2(len * 0.94)},0`} stroke="#f6b08f" strokeOpacity="0.7" strokeWidth="0.8" />
      <path d={leafVeins(len)} fill="none" stroke="#f6b08f" strokeOpacity="0.45" strokeWidth="0.55" />
    </g>
  );
}

export function Bouquet({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      {/* sway the whole layer: composited by the GPU, no per-frame SVG repaint */}
      <svg viewBox="0 0 520 640" preserveAspectRatio="xMidYMax meet" className="h-full w-full origin-bottom animate-sway drop-shadow-[0_18px_22px_rgb(120_50_20/0.16)] will-change-transform">
        <defs>
          <linearGradient id="bq-petal-outer" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#c4562a" />
            <stop offset="0.55" stopColor="#ef8557" />
            <stop offset="1" stopColor="#f8b493" />
          </linearGradient>
          <linearGradient id="bq-petal-mid" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#b84d24" />
            <stop offset="0.6" stopColor="#ea7c4c" />
            <stop offset="1" stopColor="#f5a07a" />
          </linearGradient>
          <linearGradient id="bq-petal-inner" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#a8441d" />
            <stop offset="0.7" stopColor="#df6e3f" />
            <stop offset="1" stopColor="#f08a5d" />
          </linearGradient>
          <linearGradient id="bq-petal-core" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#963b18" />
            <stop offset="1" stopColor="#d9663a" />
          </linearGradient>
          <linearGradient id="bq-leaf" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#b7522a" />
            <stop offset="1" stopColor="#e4875b" />
          </linearGradient>
          <linearGradient id="bq-stem" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#a9471f" />
            <stop offset="1" stopColor="#d4693c" />
          </linearGradient>
        </defs>

        {/* stems, drawn first so blooms sit on top */}
        {STEMS.map((s, i) => (
          <path
            key={`stem-${i}`}
            d={stemPath(s.pts)}
            pathLength={1}
            fill="none"
            stroke="url(#bq-stem)"
            strokeWidth={s.width}
            strokeLinecap="round"
            className="draw"
            style={{ animationDelay: `${100 + i * 90}ms` }}
          />
        ))}

        {/* thorns along the main stems */}
        {MAIN.flatMap((s, si) =>
          [0.18, 0.36, 0.55].map((t, ti) => {
            const [x, y] = bez(...s.pts, t);
            const a = angleAt(...s.pts, t) + (ti % 2 ? 90 : -90);
            return (
              <path
                key={`thorn-${si}-${ti}`}
                d="M0,-2.2 L7,0 L0,2.2 Z"
                transform={`translate(${r2(x)},${r2(y)}) rotate(${r2(a - 35 * (ti % 2 ? -1 : 1))})`}
                fill="#a9471f"
                className="animate-fade-in"
                style={{ animationDelay: `${900 + si * 80}ms` }}
              />
            );
          }),
        )}

        {/* compound rose leaves: a stalk with a terminal leaflet and two pairs of side leaflets */}
        {LEAVES.map((l, i) => {
          const s = STEMS[l.stem].pts;
          const [x, y] = bez(...s, l.t);
          const a = angleAt(...s, l.t) + l.side * 50;
          const rachis = l.len * 1.15;
          const leaflet = l.len * 0.64;
          const pairs = [0.38, 0.7];
          return (
            <g key={`leaf-${i}`} transform={`translate(${r2(x)},${r2(y)}) rotate(${r2(a)})`}>
              <g className="animate-leaf" style={{ animationDelay: `${700 + i * 70}ms` }}>
                {/* solid stroke: a gradient on a straight line has a zero-height box and renders nothing */}
                <path d={`M0,0 L${r2(rachis)},0`} stroke="#b9532a" strokeWidth="1.5" strokeLinecap="round" />
                {pairs.flatMap((p, pi) =>
                  [-1, 1].map((side) => (
                    <g key={`${pi}${side}`} transform={`translate(${r2(rachis * p)},0) rotate(${side * (48 - pi * 8)})`}>
                      <Leaflet len={r2(leaflet * (0.78 + pi * 0.12))} />
                    </g>
                  )),
                )}
                <g transform={`translate(${r2(rachis)},0)`}>
                  <Leaflet len={r2(leaflet * 1.05)} />
                </g>
              </g>
            </g>
          );
        })}

        {/* flowers, each exactly at the end of its stem */}
        {STEMS.map((s, i) => {
          if (!s.flower) return null;
          const [x, y] = s.pts[3];
          const delay = 1000 + i * 110;
          return (
            <g key={`flower-${i}`} transform={`translate(${r2(x)},${r2(y)})`}>
              {s.flower.kind === "rose" ? (
                <Rose size={s.flower.size} rot={s.flower.rot} delay={delay} seed={i + 1} />
              ) : (
                <Bud size={s.flower.size} angle={angleAt(...s.pts, 1)} delay={delay} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
