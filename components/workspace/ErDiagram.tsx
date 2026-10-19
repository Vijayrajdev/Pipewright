"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  // null = fit the diagram to the box's width (the default, so phones see every table)
  const [zoomChoice, setZoom] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const hasTables = ws.tables.length > 0;
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasTables]);

  const fallback = useMemo(() => initialLayout(ws.tables, relations), [ws.tables, relations]);
  const pos = (id: string) => live[id] ?? ws.positions[id] ?? fallback[id] ?? { x: 20, y: 20 };

  const bounds = ws.tables.reduce(
    (b, t) => {
      const p = pos(t.id);
      return { w: Math.max(b.w, p.x + W + 40), h: Math.max(b.h, p.y + height(t) + 40) };
    },
    { w: 600, h: 320 },
  );

  const fit = boxWidth ? Math.max(0.35, Math.min(1, (boxWidth - 2) / bounds.w)) : 1;
  const zoom = zoomChoice ?? fit;

  // per-table FK columns as one string (a stable prop for the memoised nodes) and hover neighbours
  const { fkCols, neighbors } = useMemo(() => {
    const cols = new Map<string, string[]>();
    const near = new Map<string, Set<string>>();
    for (const r of relations) {
      cols.set(r.from.table, [...(cols.get(r.from.table) ?? []), r.from.column]);
      for (const [a, b] of [[r.from.table, r.to.table], [r.to.table, r.from.table]]) {
        if (!near.has(a)) near.set(a, new Set());
        near.get(a)!.add(b);
      }
    }
    return { fkCols: new Map([...cols].map(([k, v]) => [k, v.join(",")])), neighbors: near };
  }, [relations]);
  const byId = useMemo(() => new Map(ws.tables.map((t) => [t.id, t])), [ws.tables]);
  const rowY = (t: WsTable, col: string) => {
    const i = t.fields.findIndex((f) => f.name === col);
    return pos(t.id).y + HEAD + (i < 0 ? 0 : i) * ROW + ROW / 2 + 4;
  };

  const toSvg = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  }, []);

  const startDrag = useCallback(
    (id: string, x: number, y: number, e: React.PointerEvent) => {
      const pt = toSvg(e);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      // freeze "fit" while dragging, or the zoom would shift as the diagram grows
      if (zoomChoice === null) setZoom(zoom);
      setDrag({ id, dx: pt.x - x, dy: pt.y - y });
    },
    [toSvg, zoom, zoomChoice],
  );

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
        <Button variant="ghost" onClick={() => setZoom(Math.min(1.6, zoom + 0.15))} aria-label="Zoom in">＋</Button>
        <Button variant="ghost" onClick={() => setZoom(Math.max(0.35, zoom - 0.15))} aria-label="Zoom out">－</Button>
        <Button variant="ghost" onClick={() => setZoom(null)} aria-pressed={zoomChoice === null}>
          Fit
        </Button>
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
          <span className="hidden sm:inline">Download</span> SVG
        </Button>
        <span className="label w-full text-muted lg:ml-auto lg:w-auto">
          <span className="pointer-coarse:hidden">Drag a table header to move it · hover to trace keys</span>
          <span className="hidden pointer-coarse:inline">Drag a header to move a table · tap a table to trace its keys</span>
        </span>
      </div>
      <div ref={boxRef} className="paper overflow-auto overscroll-contain border border-line" style={{ maxHeight: "min(640px, 75vh)" }}>
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width={bounds.w * zoom}
          height={bounds.h * zoom}
          viewBox={`0 0 ${bounds.w} ${bounds.h}`}
          // fingers pan the box; only table headers (touch-action none) start a drag
          className="block touch-pan-x touch-pan-y select-none"
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
            const a = byId.get(r.from.table);
            const b = byId.get(r.to.table);
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

          {/* tables: memoised, so dragging one only re-renders that one */}
          {ws.tables.map((t, ti) => {
            const p = pos(t.id);
            return (
              <TableNode
                key={t.id}
                table={t}
                index={ti}
                x={p.x}
                y={p.y}
                pk={pks[t.id] ?? null}
                fkCols={fkCols.get(t.id) ?? ""}
                hovered={hover === t.id}
                dim={!!hover && hover !== t.id && !neighbors.get(hover)?.has(t.id)}
                grabbing={drag?.id === t.id}
                onHover={setHover}
                onGrab={startDrag}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

interface NodeProps {
  table: WsTable;
  index: number;
  x: number;
  y: number;
  pk: string | null;
  /** comma-joined FK column names */
  fkCols: string;
  hovered: boolean;
  dim: boolean;
  grabbing: boolean;
  onHover: Dispatch<SetStateAction<string | null>>;
  onGrab: (id: string, x: number, y: number, e: React.PointerEvent) => void;
}

const TableNode = memo(function TableNode({ table: t, index, x, y, pk, fkCols, hovered, dim, grabbing, onHover, onGrab }: NodeProps) {
  const fks = new Set(fkCols.split(","));
  return (
    <g transform={`translate(${x},${y})`} opacity={dim ? 0.35 : 1} style={{ transition: "opacity .3s" }}>
      <g
        className="origin-center animate-pop transform-fill"
        style={{ animationDelay: `${index * 90}ms` }}
        onPointerEnter={(e) => e.pointerType === "mouse" && onHover(t.id)}
        onPointerLeave={(e) => e.pointerType === "mouse" && onHover(null)}
        // touch has no hover: a tap highlights this table's keys, another tap clears it
        onPointerUp={(e) => e.pointerType !== "mouse" && onHover((h) => (h === t.id ? null : t.id))}
      >
        <rect width={W} height={height(t)} fill="var(--color-paper)" stroke={hovered ? "var(--color-coral)" : "var(--color-line)"} strokeWidth={hovered ? 2 : 1} />
        {/* header = drag handle */}
        <rect width={W} height={HEAD} fill="var(--color-ink)" style={{ cursor: grabbing ? "grabbing" : "grab", touchAction: "none" }} onPointerDown={(e) => onGrab(t.id, x, y, e)} />
        <text x={12} y={24} fill="var(--color-ivory)" fontFamily="Archivo, sans-serif" fontWeight="800" fontSize="13" letterSpacing="0.06em" style={{ pointerEvents: "none", textTransform: "uppercase" }}>
          {t.name}
        </text>
        <text x={W - 12} y={24} textAnchor="end" fill="var(--color-coral)" fontFamily="Archivo, sans-serif" fontSize="10" style={{ pointerEvents: "none" }}>
          {t.rowCount.toLocaleString()} rows
        </text>
        {t.fields.map((f, i) => {
          const fy = HEAD + i * ROW + 4;
          const isPk = pk === f.name;
          const isFk = fks.has(f.name);
          return (
            <g key={f.name}>
              {i % 2 === 1 && <rect x={1} y={fy} width={W - 2} height={ROW} fill="var(--color-ivory)" opacity="0.5" />}
              {(isPk || isFk) && (
                <text x={12} y={fy + 16} fontFamily="JetBrains Mono, monospace" fontSize="9" fontWeight="700" fill={isPk ? "var(--color-coral-deep)" : "var(--color-ink)"}>
                  {isPk ? "PK" : "FK"}
                </text>
              )}
              <text x={36} y={fy + 16} fontFamily="JetBrains Mono, monospace" fontSize="11.5" fill="var(--color-text)" fontWeight={isPk ? 700 : 400}>
                {f.name}
              </text>
              <text x={W - 12} y={fy + 16} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="10.5" fill="var(--color-muted)">
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
});
