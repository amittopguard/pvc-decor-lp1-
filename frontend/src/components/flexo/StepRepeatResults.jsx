import React from "react";
import { AlertTriangle, Layers } from "lucide-react";
import WebDiagram from "./WebDiagram";
import { colorForIndex } from "@/components/cutlist/SheetDiagram";
import { formatArea, formatLength, formatPercent, getUnit } from "@/lib/cutlist/units";
import { formatPaise } from "@/lib/costing/costing";

function Stat({ label, value, sub, tone = "default" }) {
  const tones = { default: "text-slate-900 dark:text-slate-100", good: "text-emerald-600 dark:text-emerald-400", warn: "text-orange-600", bad: "text-red-600 dark:text-red-400" };
  return (
    <div className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`font-display text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

/** Lay one repeat out for the diagram. The block is centred, as it is mounted. */
export function stepRepeatRects(option, margin, color = colorForIndex(0)) {
  const usable = option.webWidth - 2 * margin;
  const blockWidth = option.across * option.labelWidth + (option.across - 1) * option.gapAcross;
  const x0 = margin + Math.max(0, (usable - blockWidth) / 2);
  const pitchY = option.labelHeight + option.gapAround;
  const rects = [];
  for (let c = 0; c < option.across; c++) {
    for (let r = 0; r < option.around; r++) {
      rects.push({
        x: x0 + c * (option.labelWidth + option.gapAcross),
        y: option.gapAround / 2 + r * pitchY,
        w: option.labelWidth,
        h: option.labelHeight,
        color,
        rotated: option.rotated,
        name: "",
      });
    }
  }
  return rects;
}

export default function StepRepeatResults({ result, unit, margin, selected, onSelect, quantity }) {
  if (!result) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-8 text-center">
        <Layers className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="font-display text-base font-semibold text-slate-700 dark:text-slate-300">No layout yet</p>
        <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Enter the label size, your web widths and the cylinders you own, then press Calculate. Every viable
          web × cylinder × orientation is ranked by the material each label costs.
        </p>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-400">
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
  const rects = stepRepeatRects(option, margin);
  const best = result.best;
  // "vs best" has to be measured on whatever the ranking used, or the table
  // contradicts its own ordering.
  const priced = result.rankedBy === "cost";
  const metric = (o) => (priced ? o.costPerThousand : o.materialPerLabel);
  const penalty = metric(option) / metric(best) - 1;

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${priced ? "xl:grid-cols-7" : "xl:grid-cols-6"}`}>
        <Stat label="Layout" value={`${option.across} × ${option.around}`} sub={`${option.perRev} labels per turn`} />
        <Stat
          label="Cylinder"
          value={`${option.teeth}T`}
          sub={`${formatLength(option.repeat, unit)} ${u.label} repeat`}
        />
        <Stat
          label="Material used"
          value={formatPercent(option.utilisation)}
          tone={option.utilisation > 0.8 ? "good" : option.utilisation > 0.65 ? "warn" : "bad"}
          sub={`${formatLength(option.edgeWaste, unit)} ${u.label} trim`}
        />
        {priced && (
          <Stat
            label="Per 1000"
            value={formatPaise(option.costPerThousand)}
            sub={`${formatPaise(option.platePerThousand)} plates + ${formatPaise(option.materialPerThousand)} film`}
            tone={penalty > 0.02 ? "warn" : "good"}
          />
        )}
        <Stat
          label="Per label"
          value={`${formatLength(option.materialPerLabel / 100, unit)} cm²`}
          sub={penalty > 0.0001 ? `${formatPercent(penalty, 1)} above best` : priced ? "cheapest option" : "least material"}
          tone={penalty > 0.02 ? "warn" : "good"}
        />
        <Stat
          label="Slit to"
          value={`${formatLength(option.webWidth, unit)} ${u.label}`}
          tone={option.belowMinimum ? "warn" : "default"}
          sub={option.belowMinimum ? "minimum print width" : `${option.across} lanes wide`}
        />
        {quantity > 0 ? (
          <Stat
            label="Run"
            value={`${(option.webLength / (unit === "mm" ? 1000 : 1)).toFixed(unit === "mm" ? 0 : 1)} ${unit === "mm" ? "m" : u.label}`}
            sub={`${option.revolutions.toLocaleString()} turns, ${option.overrun.toLocaleString()} over`}
          />
        ) : (
          <Stat label="Run" value="—" sub="enter an order quantity" />
        )}
      </div>

      <section className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            One repeat
            <span className="ml-2 font-sans text-xs font-normal text-slate-500 dark:text-slate-400">
              {option.across} across × {option.around} around
              {option.rotated ? " — label rotated 90°" : ""}
            </span>
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            gutter {formatLength(option.gapAcross, unit)} · gap around {formatLength(option.gapAround, unit)} {u.label}
          </span>
        </header>
        <div className="p-3">
          <WebDiagram
            webWidth={option.webWidth}
            repeat={option.repeat}
            rects={rects}
            unit={unit}
            margin={margin}
          />
          {option.belowMinimum && (
            <p className="mt-2 text-center text-xs text-orange-700 dark:text-orange-400">
              These lanes need less than the minimum print width, so the run is charged at the minimum and the spare
              width is trim. More lanes, or a wider label, would use it.
            </p>
          )}
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
            Faded rows are the next repeat — the cylinder is continuous, so leftover repeat becomes gap, not waste.
            Red edges are trim.
          </p>
        </div>
      </section>

      <section className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <header className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">
            Alternatives
            <span className="ml-2 font-sans text-xs font-normal normal-case text-slate-500 dark:text-slate-400">
              {result.evaluated} layouts evaluated, ranked by{" "}
              {priced ? "cost per thousand labels" : "material per label"} — click a row to preview
            </span>
          </h3>
        </header>
        <div className="relative max-h-[420px] overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-2 py-1.5 text-left font-medium">Web</th>
                <th className="px-2 py-1.5 text-right font-medium">Teeth</th>
                <th className="px-2 py-1.5 text-right font-medium">Repeat</th>
                <th className="px-2 py-1.5 text-right font-medium">Across × around</th>
                <th className="px-2 py-1.5 text-right font-medium">Per turn</th>
                <th className="px-2 py-1.5 text-right font-medium">Used</th>
                <th className="px-2 py-1.5 text-right font-medium">Trim</th>
                {priced && <th className="px-2 py-1.5 text-right font-medium">Plates</th>}
                {priced && <th className="px-2 py-1.5 text-right font-medium">₹/1000</th>}
                <th className="px-2 py-1.5 text-right font-medium">vs best</th>
              </tr>
            </thead>
            <tbody>
              {result.options.map((o, i) => {
                const delta = metric(o) / metric(best) - 1;
                return (
                  <tr
                    key={o.id}
                    onClick={() => onSelect(i)}
                    className={`cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-orange-50 dark:hover:bg-orange-950/40 ${
                      i === selected ? "bg-orange-50 dark:bg-orange-950/40 font-medium" : ""
                    }`}
                  >
                    <td className="px-2 py-1 tabular-nums">{formatLength(o.webWidth, unit)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{o.teeth}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatLength(o.repeat, unit)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {o.across} × {o.around}
                      {o.rotated && <span className="ml-1 text-orange-600">↻</span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{o.perRev}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatPercent(o.utilisation)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatLength(o.edgeWaste, unit)}</td>
                    {priced && (
                      <td className="px-2 py-1 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {formatPaise(o.plateCost)}
                      </td>
                    )}
                    {priced && <td className="px-2 py-1 text-right tabular-nums">{formatPaise(o.costPerThousand)}</td>}
                    <td className={`px-2 py-1 text-right tabular-nums ${delta > 0.02 ? "text-red-600 dark:text-red-400" : delta > 0.0001 ? "text-orange-600" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {delta < 0.0001 ? "best" : `+${(delta * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {quantity > 0 && (
        <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
          For {quantity.toLocaleString()} labels this layout runs {option.revolutions.toLocaleString()} turns —{" "}
          {formatLength(option.webLength, unit)} {u.label} of web, {formatArea(option.materialArea, unit)} of material,
          with {option.overrun.toLocaleString()} labels over.
          {priced && (
            <>
              {" "}
              {option.plateCount} plate{option.plateCount === 1 ? "" : "s"} of{" "}
              {option.plateAreaCm2.toFixed(0)} cm² cost {formatPaise(option.plateCost)} and the film{" "}
              {formatPaise(option.materialCost)} — {formatPaise(option.totalCost)} in all. The plates are a one-off, so
              the longer the run the less they matter.
            </>
          )}
        </p>
      )}
    </div>
  );
}
