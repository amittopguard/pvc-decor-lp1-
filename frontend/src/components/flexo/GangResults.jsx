import React from "react";
import { AlertTriangle, Rows3 } from "lucide-react";
import WebDiagram from "./WebDiagram";
import { colorForIndex } from "@/components/cutlist/SheetDiagram";
import { formatArea, formatLength, formatPercent, getUnit } from "@/lib/cutlist/units";

function Stat({ label, value, sub, tone = "default" }) {
  const tones = { default: "text-slate-900", good: "text-emerald-600", warn: "text-orange-600", bad: "text-red-600" };
  return (
    <div className="border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-display text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Lay the gang out across the web: each SKU's lanes sit side by side. */
export function gangRects(option, margin, gapAcross, colorOf) {
  const usable = option.webWidth - 2 * margin;
  const x0 = margin + Math.max(0, (usable - option.usedWidth) / 2);
  const rects = [];
  let x = x0;
  option.lanes.forEach((lane) => {
    for (let l = 0; l < lane.lanes; l++) {
      const pitchY = lane.height + lane.gapAround;
      for (let r = 0; r < lane.around; r++) {
        rects.push({
          x,
          y: lane.gapAround / 2 + r * pitchY,
          w: lane.width,
          h: lane.height,
          color: colorOf(lane.id),
          rotated: lane.rotated,
          name: r === 0 ? lane.name : "",
        });
      }
      x += lane.width + gapAcross;
    }
  });
  return rects;
}

export default function GangResults({ result, unit, margin, gapAcross, selected, onSelect, colorOf }) {
  if (!result) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-slate-300 bg-white p-8 text-center">
        <Rows3 className="mb-3 h-8 w-8 text-slate-300" />
        <p className="font-display text-base font-semibold text-slate-700">No gang plan yet</p>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          List the SKUs sharing the run with their ordered quantities. The planner assigns lanes so the SKUs finish
          together, because the press runs until the slowest one is done and everything else overruns.
        </p>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertTriangle className="mb-2 h-5 w-5" />
        <ul className="ml-4 list-disc space-y-0.5">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }

  const u = getUnit(unit);
  const option = result.options[selected] || result.best;
  const rects = gangRects(option, margin, gapAcross, colorOf);
  const ordered = option.lanes.reduce((s, l) => s + l.ordered, 0);
  const overrunPct = ordered > 0 ? option.totalOverrun / ordered : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Lanes" value={option.totalLanes} sub={`${option.lanes.length} SKUs on the web`} />
        <Stat label="Cylinder" value={`${option.teeth}T`} sub={`${formatLength(option.repeat, unit)} ${u.label} repeat`} />
        <Stat label="Web" value={formatLength(option.webWidth, unit)} sub={`${formatLength(option.edgeWaste, unit)} ${u.label} trim`} />
        <Stat
          label="Material used"
          value={formatPercent(option.utilisation)}
          tone={option.utilisation > 0.8 ? "good" : option.utilisation > 0.65 ? "warn" : "bad"}
        />
        <Stat
          label="Overrun"
          value={formatPercent(overrunPct)}
          tone={overrunPct > 0.15 ? "bad" : overrunPct > 0.05 ? "warn" : "good"}
          sub={`${option.totalOverrun.toLocaleString()} labels`}
        />
        <Stat
          label="Run"
          value={`${(option.webLength / (unit === "mm" ? 1000 : 1)).toFixed(unit === "mm" ? 0 : 1)} ${unit === "mm" ? "m" : u.label}`}
          sub={`${option.revolutions.toLocaleString()} turns`}
        />
      </div>

      <section className="border border-slate-200 bg-white">
        <header className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            One repeat
            <span className="ml-2 font-sans text-xs font-normal text-slate-500">
              {option.totalLanes} lanes across {formatLength(option.webWidth, unit)} {u.label}
            </span>
          </h3>
        </header>
        <div className="p-3">
          <WebDiagram webWidth={option.webWidth} repeat={option.repeat} rects={rects} unit={unit} margin={margin} />
        </div>
      </section>

      <section className="border border-slate-200 bg-white">
        <header className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-900">Per SKU</h3>
        </header>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 text-left font-medium">SKU</th>
                <th className="px-2 py-1.5 text-right font-medium">Lanes</th>
                <th className="px-2 py-1.5 text-right font-medium">Around</th>
                <th className="px-2 py-1.5 text-right font-medium">Per turn</th>
                <th className="px-2 py-1.5 text-right font-medium">Ordered</th>
                <th className="px-2 py-1.5 text-right font-medium">Printed</th>
                <th className="px-2 py-1.5 text-right font-medium">Overrun</th>
              </tr>
            </thead>
            <tbody>
              {option.lanes.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1">
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 border border-slate-300 align-middle"
                      style={{ background: colorOf(l.id) }}
                    />
                    {l.name}
                    {l.rotated && <span className="ml-1 text-orange-600" title="Rotated 90°">↻</span>}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{l.lanes}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{l.around}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{l.perRev}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{l.ordered.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{l.printed.toLocaleString()}</td>
                  <td
                    className={`px-2 py-1 text-right tabular-nums ${
                      l.overrunPct > 0.15 ? "text-red-600" : l.overrunPct > 0.05 ? "text-orange-600" : "text-emerald-600"
                    }`}
                  >
                    {l.overrun.toLocaleString()} ({formatPercent(l.overrunPct, 1)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-slate-200 bg-white">
        <header className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-900">
            Alternative plans
            <span className="ml-2 font-sans text-xs font-normal normal-case text-slate-500">
              {result.combos} combinations searched in {result.elapsedMs} ms — click to preview
            </span>
          </h3>
        </header>
        <div className="relative max-h-[320px] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 text-left font-medium">Web</th>
                <th className="px-2 py-1.5 text-right font-medium">Teeth</th>
                <th className="px-2 py-1.5 text-right font-medium">Lanes</th>
                <th className="px-2 py-1.5 text-right font-medium">Turns</th>
                <th className="px-2 py-1.5 text-right font-medium">Material</th>
                <th className="px-2 py-1.5 text-right font-medium">Overrun</th>
              </tr>
            </thead>
            <tbody>
              {result.options.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => onSelect(i)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-orange-50 ${
                    i === selected ? "bg-orange-50 font-medium" : ""
                  }`}
                >
                  <td className="px-2 py-1 tabular-nums">{formatLength(o.webWidth, unit)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{o.teeth}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {o.lanes.map((l) => `${l.lanes}${l.rotated ? "↻" : ""}`).join(" : ")}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{o.revolutions.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatArea(o.materialArea, unit)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{o.totalOverrun.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
