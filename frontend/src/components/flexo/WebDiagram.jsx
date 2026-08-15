import React from "react";
import { formatLength } from "@/lib/cutlist/units";

/**
 * One repeat of the web, drawn across-web on X and down-web on Y.
 *
 * The repeat boundary is drawn as a dashed rule with a ghosted row of the next
 * repeat above and below, because the cylinder never stops — the layout tiles
 * down-web forever, and that is what makes the leftover repeat a gap rather
 * than waste.
 */
export default function WebDiagram({
  webWidth,
  repeat,
  rects = [],
  unit = "mm",
  margin = 0,
  showGhost = true,
  height = 560,
}) {
  if (!webWidth || !repeat) return null;

  const span = Math.max(webWidth, repeat);
  const gutter = span * 0.09;
  const base = span / 40;
  const stroke = span / 600;
  const ghost = showGhost ? repeat * 0.16 : 0;

  const viewBox = `${-gutter} ${-ghost - gutter * 0.5} ${webWidth + gutter * 1.4} ${
    repeat + ghost * 2 + gutter
  }`;

  const label = (r, dy) => {
    const vertical = r.h > r.w * 1.3;
    const along = vertical ? r.h : r.w;
    const across = vertical ? r.w : r.h;
    const text = r.name || "";
    const dims = `${formatLength(r.w, unit)} × ${formatLength(r.h, unit)}`;
    let fs = Math.min(base, across * 0.26);
    const widest = Math.max(text.length, dims.length) * fs * 0.55;
    if (widest > along * 0.85) fs *= (along * 0.85) / widest;
    if (fs < base * 0.28) return null;
    const cx = r.x + r.w / 2;
    const cy = r.y + dy + r.h / 2;
    const lines = [text, dims].filter(Boolean);
    return (
      <g transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}>
        {lines.map((t, i) => (
          <text
            key={i}
            x={cx}
            y={cy + (i - (lines.length - 1) / 2) * fs * 1.15 + fs * 0.34}
            textAnchor="middle"
            fontSize={fs}
            fontWeight={i === 0 ? 600 : 400}
            fill="#0f172a"
          >
            {t}
          </text>
        ))}
      </g>
    );
  };

  const row = (dy, opacity) => (
    <g opacity={opacity}>
      {rects.map((r, i) => (
        <g key={`${dy}-${i}`}>
          <rect
            x={r.x}
            y={r.y + dy}
            width={r.w}
            height={r.h}
            fill={r.color || "#bfdbfe"}
            stroke="#0f172a"
            strokeWidth={stroke * 1.2}
          >
            {opacity === 1 && (
              <title>
                {`${r.name || "Label"} — ${formatLength(r.w, unit)} × ${formatLength(r.h, unit)} ${unit}` +
                  `${r.rotated ? " (rotated)" : ""}`}
              </title>
            )}
          </rect>
          {opacity === 1 && label(r, dy)}
        </g>
      ))}
    </g>
  );

  return (
    <svg viewBox={viewBox} className="w-full" style={{ maxHeight: height }} role="img"
      aria-label={`Web layout: ${formatLength(webWidth, unit)} wide, ${formatLength(repeat, unit)} repeat`}>
      {/* web material, running past the repeat in both directions */}
      <rect
        x="0"
        y={-ghost}
        width={webWidth}
        height={repeat + ghost * 2}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth={stroke}
      />

      {/* edge margins are trim you pay for on every metre */}
      {margin > 0 && (
        <>
          <rect x="0" y={-ghost} width={margin} height={repeat + ghost * 2} fill="#fee2e2" opacity="0.7" />
          <rect
            x={webWidth - margin}
            y={-ghost}
            width={margin}
            height={repeat + ghost * 2}
            fill="#fee2e2"
            opacity="0.7"
          />
        </>
      )}

      {showGhost && (
        <>
          {row(-repeat, 0.18)}
          {row(repeat, 0.18)}
        </>
      )}
      {row(0, 1)}

      {/* repeat boundary */}
      <line x1="0" y1="0" x2={webWidth} y2="0" stroke="#dc2626" strokeWidth={stroke * 2}
        strokeDasharray={`${base * 0.5} ${base * 0.35}`} />
      <line x1="0" y1={repeat} x2={webWidth} y2={repeat} stroke="#dc2626" strokeWidth={stroke * 2}
        strokeDasharray={`${base * 0.5} ${base * 0.35}`} />

      {/* dimensions */}
      <g fill="#475569" fontSize={base * 0.9}>
        <line x1="0" y1={-ghost - gutter * 0.25} x2={webWidth} y2={-ghost - gutter * 0.25}
          stroke="#94a3b8" strokeWidth={stroke} />
        <text x={webWidth / 2} y={-ghost - gutter * 0.45} textAnchor="middle">
          web {formatLength(webWidth, unit, true)}
        </text>

        <line x1={webWidth + gutter * 0.35} y1="0" x2={webWidth + gutter * 0.35} y2={repeat}
          stroke="#dc2626" strokeWidth={stroke} />
        <line x1={webWidth + gutter * 0.2} y1="0" x2={webWidth + gutter * 0.5} y2="0"
          stroke="#dc2626" strokeWidth={stroke} />
        <line x1={webWidth + gutter * 0.2} y1={repeat} x2={webWidth + gutter * 0.5} y2={repeat}
          stroke="#dc2626" strokeWidth={stroke} />
        <text
          x={webWidth + gutter * 0.75}
          y={repeat / 2}
          textAnchor="middle"
          fill="#dc2626"
          transform={`rotate(-90 ${webWidth + gutter * 0.75} ${repeat / 2})`}
        >
          repeat {formatLength(repeat, unit, true)}
        </text>
      </g>
    </svg>
  );
}
