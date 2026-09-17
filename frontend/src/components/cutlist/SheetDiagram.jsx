import React, { useMemo } from "react";
import { formatLength } from "@/lib/cutlist/units";

/** Fills chosen to stay distinguishable while keeping dark text readable. */
export const PART_COLORS = [
  "#bfdbfe", "#fed7aa", "#bbf7d0", "#fecaca", "#ddd6fe", "#fde68a",
  "#a5f3fc", "#f5d0fe", "#d9f99d", "#fbcfe8", "#c7d2fe", "#99f6e4",
  "#fef08a", "#e9d5ff", "#bae6fd", "#fecdd3",
];

export const colorForIndex = (i) => PART_COLORS[((i % PART_COLORS.length) + PART_COLORS.length) % PART_COLORS.length];

const estimateTextWidth = (text, fontSize) => text.length * fontSize * 0.55;

/**
 * Draws one stock sheet with the parts placed on it.
 * All geometry is in sheet units; the SVG viewBox does the scaling so the
 * drawing stays sharp at any size and prints cleanly.
 */
export default function SheetDiagram({ sheet, unit, colorFor, options = {} }) {
  const {
    showLabels = true,
    showDimensions = true,
    showCuts = false,
    showOffcuts = true,
  } = options;

  const L = sheet.length;
  const W = sheet.width;

  const geom = useMemo(() => {
    const span = Math.max(L, W);
    const gutter = span * 0.05;
    const pad = span * 0.015;
    return {
      gutter,
      pad,
      base: span / 48,
      stroke: span / 700,
      viewBox: `${-gutter - pad} ${-gutter - pad} ${L + gutter + pad * 2} ${W + gutter + pad * 2}`,
    };
  }, [L, W]);

  const { gutter, base, stroke, viewBox } = geom;
  const hatchId = `hatch-${sheet.id}`;

  const renderPartText = (p) => {
    const dims = `${formatLength(p.w, unit)} × ${formatLength(p.h, unit)}`;
    const name = p.label || "";
    const vertical = p.h > p.w * 1.35;
    const along = vertical ? p.h : p.w;
    const across = vertical ? p.w : p.h;

    let fontSize = Math.min(base, across * 0.3);
    const widest = Math.max(estimateTextWidth(dims, fontSize), estimateTextWidth(name, fontSize));
    if (widest > along * 0.88) fontSize *= (along * 0.88) / widest;

    if (fontSize < base * 0.3) return null;

    const showName = showLabels && !!name && across > fontSize * 2.6;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const lineGap = fontSize * 1.15;
    const lines = [];
    if (showName) lines.push({ text: name, weight: 600 });
    if (showDimensions) lines.push({ text: dims, weight: 400 });
    if (!lines.length) return null;

    const startY = cy - ((lines.length - 1) * lineGap) / 2 + fontSize * 0.34;

    return (
      <g transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}>
        {lines.map((line, i) => (
          <text
            key={i}
            x={cx}
            y={startY + i * lineGap}
            textAnchor="middle"
            fontSize={fontSize}
            fontWeight={line.weight}
            fill="#0f172a"
            style={{ pointerEvents: "none" }}
          >
            {line.text}
          </text>
        ))}
      </g>
    );
  };

  const renderOffcutText = (o) => {
    const dims = `${formatLength(o.w, unit)} × ${formatLength(o.h, unit)}`;
    const vertical = o.h > o.w * 1.35;
    const along = vertical ? o.h : o.w;
    const across = vertical ? o.w : o.h;
    let fontSize = Math.min(base * 0.8, across * 0.28);
    const widest = estimateTextWidth(dims, fontSize);
    if (widest > along * 0.85) fontSize *= (along * 0.85) / widest;
    if (fontSize < base * 0.3) return null;
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    return (
      <text
        transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
        x={cx}
        y={cy + fontSize * 0.34}
        textAnchor="middle"
        fontSize={fontSize}
        fill="#94a3b8"
        style={{ pointerEvents: "none" }}
      >
        {dims}
      </text>
    );
  };

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-auto"
      role="img"
      aria-label={`Cutting layout for sheet ${sheet.index}, ${formatLength(L, unit)} by ${formatLength(W, unit)}`}
    >
      <defs>
        <pattern id={hatchId} width={base * 0.7} height={base * 0.7} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width={base * 0.7} height={base * 0.7} fill="#f8fafc" />
          <line x1="0" y1="0" x2="0" y2={base * 0.7} stroke="#e2e8f0" strokeWidth={stroke * 2} />
        </pattern>
      </defs>

      {/* stock sheet */}
      <rect x="0" y="0" width={L} height={W} fill={`url(#${hatchId})`} stroke="#0f172a" strokeWidth={stroke * 2} />

      {/* reusable offcuts */}
      {showOffcuts &&
        sheet.offcuts.map((o, i) => (
          <g key={`off-${i}`}>
            <rect
              x={o.x}
              y={o.y}
              width={o.w}
              height={o.h}
              fill="#ffffff"
              fillOpacity="0.55"
              stroke="#cbd5e1"
              strokeWidth={stroke}
              strokeDasharray={`${base * 0.3} ${base * 0.25}`}
            />
            {renderOffcutText(o)}
          </g>
        ))}

      {/* placed parts */}
      {sheet.placements.map((p) => (
        <g key={p.uid}>
          <rect
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            fill={colorFor(p.rowId)}
            stroke="#0f172a"
            strokeWidth={stroke * 1.4}
          >
            <title>
              {`${p.label || "Part"} — ${formatLength(p.w, unit)} × ${formatLength(p.h, unit)} ${unit}` +
                `${p.rotated ? " (rotated)" : ""} at x ${formatLength(p.x, unit)}, y ${formatLength(p.y, unit)}`}
            </title>
          </rect>
          {p.rotated && (
            <path
              d={`M ${p.x + base * 0.35} ${p.y + base * 0.95} l ${base * 0.5} 0 m ${-base * 0.5} 0 l 0 ${-base * 0.5}`}
              stroke="#64748b"
              strokeWidth={stroke * 1.5}
              fill="none"
            />
          )}
          {renderPartText(p)}
        </g>
      ))}

      {/* guillotine cut lines */}
      {showCuts &&
        sheet.cuts.map((c, i) =>
          c.dir === "v" ? (
            <line
              key={`c-${i}`}
              x1={c.pos}
              y1={c.from}
              x2={c.pos}
              y2={c.to}
              stroke="#dc2626"
              strokeWidth={stroke * 1.6}
              strokeDasharray={`${base * 0.4} ${base * 0.3}`}
            />
          ) : (
            <line
              key={`c-${i}`}
              x1={c.from}
              y1={c.pos}
              x2={c.to}
              y2={c.pos}
              stroke="#dc2626"
              strokeWidth={stroke * 1.6}
              strokeDasharray={`${base * 0.4} ${base * 0.3}`}
            />
          )
        )}

      {/* rulers */}
      <g fill="#475569" fontSize={base * 0.85}>
        <line x1="0" y1={-gutter * 0.45} x2={L} y2={-gutter * 0.45} stroke="#94a3b8" strokeWidth={stroke} />
        <line x1="0" y1={-gutter * 0.7} x2="0" y2={-gutter * 0.2} stroke="#94a3b8" strokeWidth={stroke} />
        <line x1={L} y1={-gutter * 0.7} x2={L} y2={-gutter * 0.2} stroke="#94a3b8" strokeWidth={stroke} />
        <text x={L / 2} y={-gutter * 0.75} textAnchor="middle">
          {formatLength(L, unit, true)}
        </text>

        <line x1={-gutter * 0.45} y1="0" x2={-gutter * 0.45} y2={W} stroke="#94a3b8" strokeWidth={stroke} />
        <line x1={-gutter * 0.7} y1="0" x2={-gutter * 0.2} y2="0" stroke="#94a3b8" strokeWidth={stroke} />
        <line x1={-gutter * 0.7} y1={W} x2={-gutter * 0.2} y2={W} stroke="#94a3b8" strokeWidth={stroke} />
        <text
          x={-gutter * 0.75}
          y={W / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${-gutter * 0.75} ${W / 2})`}
        >
          {formatLength(W, unit, true)}
        </text>
      </g>
    </svg>
  );
}
