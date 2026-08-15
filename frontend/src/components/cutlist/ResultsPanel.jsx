import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Scissors } from "lucide-react";
import SheetDiagram from "./SheetDiagram";
import { formatArea, formatDistance, formatLength, formatPercent, getUnit } from "@/lib/cutlist/units";

function Stat({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-orange-600",
    bad: "text-red-600",
  };
  return (
    <div className="border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-display text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Collapsible({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 print:hidden"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
        {count !== undefined && <span className="text-slate-400">({count})</span>}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function SheetCard({ sheet, total, unit, colorFor, options }) {
  const util = sheet.utilisation;
  const tone = util > 0.85 ? "good" : util > 0.65 ? "warn" : "bad";
  const grouped = new Map();
  sheet.placements.forEach((p) => {
    const key = `${p.label}|${p.w}x${p.h}`;
    const entry = grouped.get(key) || { label: p.label, w: p.w, h: p.h, rotated: p.rotated, qty: 0 };
    entry.qty += 1;
    grouped.set(key, entry);
  });

  return (
    <article className="border border-slate-200 bg-white print:break-inside-avoid print:border-slate-400">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="font-display text-sm font-semibold text-slate-900">
          Sheet {sheet.index} of {total}
          <span className="ml-2 font-sans text-xs font-normal text-slate-500">
            {sheet.label} — {formatLength(sheet.length, unit)} × {formatLength(sheet.width, unit)} {unit}
            {sheet.material ? ` — ${sheet.material}` : ""}
          </span>
        </h3>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span>
            <strong className="tabular-nums text-slate-900">{sheet.placements.length}</strong> parts
          </span>
          <span>
            <strong className="tabular-nums text-slate-900">{sheet.cutCount}</strong> cuts
          </span>
          <span className={tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-orange-600" : "text-red-600"}>
            <strong className="tabular-nums">{formatPercent(util)}</strong> used
          </span>
        </div>
      </header>

      <div className="p-3">
        <SheetDiagram sheet={sheet} unit={unit} colorFor={colorFor} options={options} />
      </div>

      <Collapsible title="Parts on this sheet" count={sheet.placements.length}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 font-medium">Part</th>
              <th className="py-1 text-right font-medium">Size</th>
              <th className="py-1 text-right font-medium">Qty</th>
            </tr>
          </thead>
          <tbody>
            {[...grouped.values()].map((g, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1 text-slate-800">{g.label || "—"}</td>
                <td className="py-1 text-right tabular-nums text-slate-600">
                  {formatLength(g.w, unit)} × {formatLength(g.h, unit)}
                </td>
                <td className="py-1 text-right tabular-nums text-slate-800">{g.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Collapsible>

      <Collapsible title="Cut sequence" count={sheet.cutCount}>
        <ol className="space-y-0.5 text-xs text-slate-700">
          {sheet.cuts.map((c, i) => (
            <li key={i} className="flex gap-2 tabular-nums">
              <span className="w-6 shrink-0 text-slate-400">{i + 1}.</span>
              <span>
                {c.dir === "v" ? "Vertical" : "Horizontal"} cut at{" "}
                <strong>
                  {c.dir === "v" ? "x" : "y"} = {formatLength(c.pos, unit)} {unit}
                </strong>{" "}
                <span className="text-slate-500">
                  ({formatLength(c.length, unit)} {unit} long, from {formatLength(c.from, unit)} to{" "}
                  {formatLength(c.to, unit)})
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Collapsible>

      {sheet.largestOffcut && (
        <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          Largest reusable offcut:{" "}
          <strong className="tabular-nums text-slate-700">
            {formatLength(sheet.largestOffcut.w, unit)} × {formatLength(sheet.largestOffcut.h, unit)} {unit}
          </strong>
        </div>
      )}
    </article>
  );
}

export default function ResultsPanel({ result, unit, colorFor, options, onOptionChange }) {
  if (!result) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-slate-300 bg-white p-8 text-center">
        <Scissors className="mb-3 h-8 w-8 text-slate-300" />
        <p className="font-display text-base font-semibold text-slate-700">No layout yet</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Enter the parts you need and the sheets you have, then press Calculate. The optimiser tries dozens of packing
          strategies and keeps the one that wastes the least material.
        </p>
      </div>
    );
  }

  if (!result.ok && !result.sheets.length) {
    return (
      <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertTriangle className="mb-2 h-5 w-5" />
        {result.error}
      </div>
    );
  }

  const s = result.summary;
  const u = getUnit(unit);
  const unplacedTotal = result.unplaced.reduce((t, x) => t + x.qty, 0);

  const toggle = (key, label) => (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
      <input
        type="checkbox"
        checked={!!options[key]}
        onChange={(e) => onOptionChange({ ...options, [key]: e.target.checked })}
        className="h-3.5 w-3.5 cursor-pointer accent-orange-600"
      />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sheets used" value={s.sheetCount} sub={`${s.placedCount} parts placed`} />
        <Stat
          label="Material used"
          value={formatPercent(s.utilisation)}
          sub={formatArea(s.usedArea, unit)}
          tone={s.utilisation > 0.85 ? "good" : s.utilisation > 0.65 ? "warn" : "bad"}
        />
        <Stat label="Waste" value={formatArea(s.wasteArea, unit)} sub={formatPercent(1 - s.utilisation)} />
        <Stat label="Cuts" value={s.cuts} sub={`${formatDistance(s.cutLength, unit)} of cutting`} />
        <Stat
          label="Not placed"
          value={unplacedTotal}
          tone={unplacedTotal ? "bad" : "good"}
          sub={unplacedTotal ? "check stock sizes" : "everything fits"}
        />
        <Stat label="Solve time" value={`${result.elapsedMs} ms`} sub={`${result.passes} strategies tried`} />
      </div>

      {unplacedTotal > 0 && (
        <div className="border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {unplacedTotal} part{unplacedTotal === 1 ? "" : "s"} could not be placed
          </div>
          <ul className="ml-6 list-disc space-y-0.5 text-xs">
            {result.unplaced.map((x, i) => (
              <li key={i}>
                {x.qty} × {x.label || "part"} — {formatLength(x.length, unit)} × {formatLength(x.width, unit)} {u.label}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">
            Add more stock quantity, add a larger sheet size, or allow rotation for these parts.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-slate-200 bg-white px-3 py-2 print:hidden">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Diagram</span>
        {toggle("showLabels", "Labels")}
        {toggle("showDimensions", "Dimensions")}
        {toggle("showCuts", "Cut lines")}
        {toggle("showOffcuts", "Offcuts")}
      </div>

      <div className="space-y-4">
        {result.sheets.map((sheet) => (
          <SheetCard
            key={sheet.id}
            sheet={sheet}
            total={result.sheets.length}
            unit={unit}
            colorFor={colorFor}
            options={options}
          />
        ))}
      </div>

      <section className="border border-slate-200 bg-white print:break-inside-avoid">
        <header className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-900">Summary</h3>
        </header>
        <div className="grid gap-4 p-3 md:grid-cols-2">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Parts produced</h4>
            <table className="w-full text-xs">
              <tbody>
                {s.byPart.map((p) => (
                  <tr key={p.rowId} className="border-t border-slate-100">
                    <td className="py-1">
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 border border-slate-300 align-middle"
                        style={{ background: colorFor(p.rowId) }}
                      />
                      {p.label || "—"}
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-600">
                      {formatLength(p.length, unit)} × {formatLength(p.width, unit)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{p.placed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Stock consumed</h4>
            <table className="w-full text-xs">
              <tbody>
                {s.byStock.map((st) => (
                  <tr key={st.rowId} className="border-t border-slate-100">
                    <td className="py-1">{st.label}</td>
                    <td className="py-1 text-right tabular-nums text-slate-600">
                      {formatLength(st.length, unit)} × {formatLength(st.width, unit)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{st.count} sheets</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
