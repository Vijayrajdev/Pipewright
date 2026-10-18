"use client";

import { useMemo, useRef, useState } from "react";
import type { Relation, Workspace, WsTable } from "@/lib/workspace/types";
import { Button } from "../ui";

const W = 236;
const HEAD = 38;
const ROW = 24;
const GAP_X = 120;
const GAP_Y = 40;

const COLORS: Record<string, string> = {
  "--color-ivory": "#eae6de",
  "--color-ink": "#226192",
  "--color-ink-deep": "#1a4c73",
  "--color-ink-soft": "#dbe6ef",
  "--color-coral": "#ef8557",
  "--color-coral-deep": "#d96a3a",
  "--color-coral-soft": "#fbe3d7",
  "--color-paper": "#f7f4ee",
  "--color-line": "#cfc8bb",
  "--color-text": "#1f2a36",
  "--color-muted": "#5f6b77",
};

const height = (t: WsTable) => HEAD + t.fields.length * ROW + 8;

/** Dimensions on the right, facts on the left: level = longest FK chain to a table with no outgoing FKs. */
function initialLayout(tables: WsTable[], relations: Relation[]): Record<string, { x: number; y: number }> {
  const level = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    if (level.has(id)) return level.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const outs = relations.filter((r) => r.from.table === id && r.to.table !== id);
    const d = outs.length ? 1 + Math.max(...outs.map((r) => depth(r.to.table, seen))) : 0;
    level.set(id, d);
    return d;
  };
  tables.forEach((t) => depth(t.id, new Set()));
  const max = Math.max(0, ...level.values());
  const columns = new Map<number, WsTable[]>();
  tables.forEach((t) => {
    const col = max - (level.get(t.id) ?? 0);
    columns.set(col, [...(columns.get(col) ?? []), t]);
  });
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [col, list] of columns) {
    let y = 20;
    for (const t of list) {
      pos[t.id] = { x: 20 + col * (W + GAP_X), y };
      y += height(t) + GAP_Y;
    }
  }
  return pos;
}

interface Props {
  ws: Workspace;
  pks: Record<string, string | null>;
  relations: Relation[];
  onPositions: (positions: Workspace["positions"]) => void;
}

export function ErDiagram({ ws, pks, relations, onPositions }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [live, setLive] = useState<Workspace["positions"]>({});
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const fallback = useMemo(() => initialLayout(ws.tables, relations), [ws.tables, relations]);
  const pos = (id: string) => live[id] ?? ws.positions[id] ?? fallback[id] ?? { x: 20, y: 20 };

  const bounds = ws.tables.reduce(
    (b, t) => {
      const p = pos(t.id);
      return { w: Math.max(b.w, p.x + W + 40), h: Math.max(b.h, p.y + height(t) + 40) };
    },
    { w: 600, h: 320 },
  );

  const fks = new Set(relations.map((r) => `${r.from.table}.${r.from.column}`));
  const rowY = (t: WsTable, col: string) => {
    const i = t.fields.findIndex((f) => f.name === col);
    return pos(t.id).y + HEAD + (i < 0 ? 0 : i) * ROW + ROW / 2 + 4;
  };

  function toSvg(e: React.PointerEvent) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  }

  function exportSvg() {
    let src = new XMLSerializer().serializeToString(svgRef.current!);
    for (const [k, v] of Object.entries(COLORS)) src = src.replaceAll(`var(${k})`, v);
    src = src.replace(/class="[^"]*"/g, "");
    const url = URL.createObjectURL(new Blob([src], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ws.dataset || "data_model"}_erd.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!ws.tables.length) return <p className="text-sm text-muted">Load some files to see the diagram.</p>;

  const related = (r: Relation) => !hover || r.from.table === hover || r.to.table === hover;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} aria-label="Zoom in">＋</Button>
        <Button variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} aria-label="Zoom out">－</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setLive({});
            onPositions({});
          }}
        >
          Auto layout
        </Button>
        <Button variant="accent" onClick={exportSvg}>
          Download SVG
        </Button>
        <span className="label ml-auto text-muted">Drag a table header to move it · hover to trace keys</span>
      </div>
      <div className="paper overflow-auto border border-line" style={{ maxHeight: 640 }}>
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width={bounds.w * zoom}
          height={bounds.h * zoom}
          viewBox={`0 0 ${bounds.w} ${bounds.h}`}
          className="block touch-none select-none"
          onPointerMove={(e) => {
            if (!drag) return;
            const p = toSvg(e);
            setLive((l) => ({ ...l, [drag.id]: { x: Math.max(0, p.x - drag.dx), y: Math.max(0, p.y - drag.dy) } }));
          }}
          onPointerUp={() => {
            if (!drag) return;
            setDrag(null);
            onPositions({ ...ws.positions, ...live });
          }}
        >
          <defs>
            <marker id="many" viewBox="0 0 14 14" refX="1" refY="7" markerWidth="14" markerHeight="14" orient="auto-start-reverse">
              <path d="M1 7 L13 1 M1 7 L13 13 M1 7 L13 7" stroke="var(--color-ink)" strokeWidth="1.5" fill="none" />
            </marker>
            <marker id="one" viewBox="0 0 14 14" refX="12" refY="7" markerWidth="14" markerHeight="14" orient="auto">
              <path d="M8 1 L8 13 M12 1 L12 13" stroke="var(--color-coral-deep)" strokeWidth="1.5" fill="none" />
            </marker>
          </defs>

          {/* relationships */}
          {relations.map((r, i) => {
            const a = ws.tables.find((t) => t.id === r.from.table);
            const b = ws.tables.find((t) => t.id === r.to.table);
            if (!a || !b) return null;
            const pa = pos(a.id);
            const pb = pos(b.id);
            const y1 = rowY(a, r.from.column);
            const y2 = rowY(b, r.to.column);
            const rightward = pb.x + W / 2 >= pa.x + W / 2;
            const x1 = rightward ? pa.x + W : pa.x;
            const x2 = rightward ? pb.x : pb.x + W;
            const self = a.id === b.id;
            const bend = Math.max(50, Math.abs(x2 - x1) / 2);
            const d = self
              ? `M${pa.x + W},${y1} C${pa.x + W + 70},${y1} ${pa.x + W + 70},${y2} ${pa.x + W},${y2}`
              : `M${x1},${y1} C${x1 + (rightward ? bend : -bend)},${y1} ${x2 + (rightward ? -bend : bend)},${y2} ${x2},${y2}`;
            return (
              <g key={r.id} opacity={related(r) ? 1 : 0.15} style={{ transition: "opacity .3s" }}>
                <path
                  d={d}
                  pathLength={1}
                  fill="none"
                  stroke={hover && related(r) ? "var(--color-coral-deep)" : "var(--color-ink)"}
                  strokeWidth={hover && related(r) ? 2.2 : 1.5}
                  strokeDasharray={r.origin === "manual" ? "0.02 0.012" : undefined}
                  markerStart="url(#many)"
                  markerEnd="url(#one)"
                  className={r.origin === "manual" ? "" : "draw"}
                  style={{ animationDelay: `${300 + i * 120}ms` }}
                />
              </g>
            );
          })}

          {/* tables */}
          {ws.tables.map((t, ti) => {
            const p = pos(t.id);
            const dim = hover && hover !== t.id && !relations.some((r) => (r.from.table === hover && r.to.table === t.id) || (r.to.table === hover && r.from.table === t.id));
            return (
              <g key={t.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.35 : 1} style={{ transition: "opacity .3s" }}>
                <g
                  className="origin-center animate-pop transform-fill"
                  style={{ animationDelay: `${ti * 90}ms` }}
                  onPointerEnter={() => setHover(t.id)}
                  onPointerLeave={() => setHover(null)}
                >
                  <rect width={W} height={height(t)} fill="var(--color-paper)" stroke={hover === t.id ? "var(--color-coral)" : "var(--color-line)"} strokeWidth={hover === t.id ? 2 : 1} />
                  {/* header = drag handle */}
                  <rect
                    width={W}
                    height={HEAD}
                    fill="var(--color-ink)"
                    style={{ cursor: drag?.id === t.id ? "grabbing" : "grab" }}
                    onPointerDown={(e) => {
                      const pt = toSvg(e);
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                      setDrag({ id: t.id, dx: pt.x - p.x, dy: pt.y - p.y });
                    }}
                  />
                  <text x={12} y={24} fill="var(--color-ivory)" fontFamily="Archivo, sans-serif" fontWeight="800" fontSize="13" letterSpacing="0.06em" style={{ pointerEvents: "none", textTransform: "uppercase" }}>
                    {t.name}
                  </text>
                  <text x={W - 12} y={24} textAnchor="end" fill="var(--color-coral)" fontFamily="Archivo, sans-serif" fontSize="10" style={{ pointerEvents: "none" }}>
                    {t.rowCount.toLocaleString()} rows
                  </text>
                  {t.fields.map((f, i) => {
                    const y = HEAD + i * ROW + 4;
                    const isPk = pks[t.id] === f.name;
                    const isFk = fks.has(`${t.id}.${f.name}`);
                    return (
                      <g key={f.name}>
                        {i % 2 === 1 && <rect x={1} y={y} width={W - 2} height={ROW} fill="var(--color-ivory)" opacity="0.5" />}
                        {(isPk || isFk) && (
                          <text x={12} y={y + 16} fontFamily="JetBrains Mono, monospace" fontSize="9" fontWeight="700" fill={isPk ? "var(--color-coral-deep)" : "var(--color-ink)"}>
                            {isPk ? "PK" : "FK"}
                          </text>
                        )}
                        <text x={36} y={y + 16} fontFamily="JetBrains Mono, monospace" fontSize="11.5" fill="var(--color-text)" fontWeight={isPk ? 700 : 400}>
                          {f.name}
                        </text>
                        <text x={W - 12} y={y + 16} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="10.5" fill="var(--color-muted)">
                          {f.type}
                          {f.repeated ? "[]" : ""}
                          {f.nullable ? "" : " !"}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
