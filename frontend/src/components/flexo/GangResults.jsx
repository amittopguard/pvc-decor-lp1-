import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, GripVertical, RotateCcw, Rows3, X } from "lucide-react";
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

/** Lay one plate out across the web: each SKU's lanes sit side by side. */
export function gangRects(plan, margin, gapAcross, colorOf) {
  const usable = plan.webWidth - 2 * margin;
  const x0 = margin + Math.max(0, (usable - plan.usedWidth) / 2);
  const rects = [];
  let x = x0;
  plan.lanes.forEach((lane) => {
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

function PlateCard({ plate, total, plateCount, unit, margin, gapAcross, colorOf, move, dragging, setDragging }) {
  const [showOptions, setShowOptions] = useState(false);
  const [dropping, setDropping] = useState(false);
  const plan = plate.plan;
  const u = getUnit(unit);
  const rects = gangRects(plan, margin, gapAcross, colorOf);

  return (
    <article
      className={`border bg-white dark:bg-slate-900 transition-colors print:break-inside-avoid ${
        dropping ? "border-orange-500 ring-2 ring-orange-500/30" : "border-slate-200 dark:border-slate-700"
      }`}
      onDragOver={move ? (e) => { e.preventDefault(); setDropping(true); } : undefined}
      onDragLeave={move ? () => setDropping(false) : undefined}
      onDrop={
        move
          ? (e) => {
              e.preventDefault();
              setDropping(false);
              const id = e.dataTransfer.getData("text/plain");
              if (id) move(id, plate.index);
            }
          : undefined
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          Plate {plate.index} of {total}
          <span className="ml-2 font-sans text-xs font-normal text-slate-500 dark:text-slate-400">
            {plan.lanes.length} SKU{plan.lanes.length === 1 ? "" : "s"} · {plan.totalLanes} lanes · slit to{" "}
            {formatLength(plan.webWidth, unit)} {u.label}
          </span>
        </h3>
        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span>
            <strong className="tabular-nums text-slate-900 dark:text-slate-100">{plan.teeth}T</strong> ·{" "}
            {formatLength(plan.repeat, unit)} {u.label}
          </span>
          <span className={plan.utilisation > 0.8 ? "text-emerald-600 dark:text-emerald-400" : plan.utilisation > 0.65 ? "text-orange-600" : "text-red-600 dark:text-red-400"}>
            <strong className="tabular-nums">{formatPercent(plan.utilisation)}</strong> used
          </span>
          <span>
            <strong className="tabular-nums text-slate-900 dark:text-slate-100">{plan.revolutions.toLocaleString()}</strong> turns
          </span>
        </div>
      </header>

      <div className="p-3">
        <WebDiagram webWidth={plan.webWidth} repeat={plan.repeat} rects={rects} unit={unit} margin={margin} />
      </div>

      <div className="relative overflow-x-auto border-t border-slate-100 dark:border-slate-800">
        <table className="w-full min-w-[620px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1.5 text-left font-medium">SKU</th>
              {move && <th className="px-2 py-1.5 text-left font-medium print:hidden">Move</th>}
              <th className="px-2 py-1.5 text-right font-medium">Lanes</th>
              <th className="px-2 py-1.5 text-right font-medium">Around</th>
              <th className="px-2 py-1.5 text-right font-medium">Per turn</th>
              <th className="px-2 py-1.5 text-right font-medium">Ordered</th>
              <th className="px-2 py-1.5 text-right font-medium">Printed</th>
              <th className="px-2 py-1.5 text-right font-medium">Overrun</th>
            </tr>
          </thead>
          <tbody>
            {plan.lanes.map((l) => (
              <tr
                key={l.id}
                draggable={!!move}
                onDragStart={move ? (e) => { e.dataTransfer.setData("text/plain", l.id); setDragging(l.id); } : undefined}
                onDragEnd={move ? () => setDragging(null) : undefined}
                className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                  move ? "cursor-grab active:cursor-grabbing hover:bg-orange-50/60" : ""
                } ${dragging === l.id ? "opacity-40" : ""}`}
              >
                <td className="px-2 py-1">
                  {move && <GripVertical className="mr-1 inline h-3 w-3 align-middle text-slate-300 dark:text-slate-600 print:hidden" />}
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 border border-slate-300 dark:border-slate-600 align-middle"
                    style={{ background: colorOf(l.id) }}
                  />
                  {l.name}
                  {l.rotated && (
                    <span className="ml-1 text-orange-600" title="Turned 90°">
                      ↻
                    </span>
                  )}
                  {move && (
                    <button
                      type="button"
                      onClick={() => move(l.id, null)}
                      title={`Take ${l.name} off this run`}
                      aria-label={`Take ${l.name} off this run`}
                      className="ml-1.5 align-middle text-slate-300 dark:text-slate-600 hover:text-red-600 print:hidden"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </td>
                {move && (
                  <td className="px-2 py-1 print:hidden">
                    <select
                      value=""
                      aria-label={`Move ${l.name} to another plate`}
                      title="Move this SKU"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        move(l.id, v === "new" ? "new" : v === "off" ? null : Number(v));
                        e.target.value = "";
                      }}
                      className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-0.5 text-[11px] text-slate-600 dark:text-slate-400 outline-none focus:border-orange-500"
                    >
                      <option value="">move…</option>
                      {Array.from({ length: plateCount }, (_, i) => i + 1)
                        .filter((n) => n !== plate.index)
                        .map((n) => (
                          <option key={n} value={n}>
                            to plate {n}
                          </option>
                        ))}
                      <option value="new">to a new plate</option>
                      <option value="off">off the run</option>
                    </select>
                  </td>
                )}
                <td className="px-2 py-1 text-right tabular-nums">{l.lanes}</td>
                <td className="px-2 py-1 text-right tabular-nums">{l.around}</td>
                <td className="px-2 py-1 text-right tabular-nums">{l.perRev}</td>
                <td className="px-2 py-1 text-right tabular-nums">{l.ordered.toLocaleString()}</td>
                <td className="px-2 py-1 text-right tabular-nums">{l.printed.toLocaleString()}</td>
                <td
                  className={`px-2 py-1 text-right tabular-nums ${
                    l.overrunPct > 0.15 ? "text-red-600 dark:text-red-400" : l.overrunPct > 0.05 ? "text-orange-600" : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {l.overrun.toLocaleString()} ({formatPercent(l.overrunPct, 1)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plate.options && plate.options.length > 1 && (
        <div className="border-t border-slate-100 dark:border-slate-800 print:hidden">
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {showOptions ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Other cylinder options for this plate
            <span className="text-slate-400 dark:text-slate-500">({plate.options.length - 1})</span>
          </button>
          {showOptions && (
            <div className="relative max-h-56 overflow-auto px-3 pb-3">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-400">
                    <th className="py-1 font-medium">Slit to</th>
                    <th className="py-1 text-right font-medium">Teeth</th>
                    <th className="py-1 text-right font-medium">Turns</th>
                    <th className="py-1 text-right font-medium">Material</th>
                    <th className="py-1 text-right font-medium">Overrun</th>
                  </tr>
                </thead>
                <tbody>
                  {plate.options.slice(0, 12).map((o, i) => (
                    <tr key={o.id} className={`border-t border-slate-100 dark:border-slate-800 ${i === 0 ? "font-medium" : ""}`}>
                      <td className="py-1 tabular-nums">{formatLength(o.webWidth, unit)}</td>
                      <td className="py-1 text-right tabular-nums">{o.teeth}</td>
                      <td className="py-1 text-right tabular-nums">{o.revolutions.toLocaleString()}</td>
                      <td className="py-1 text-right tabular-nums">{formatArea(o.materialArea, unit)}</td>
                      <td className="py-1 text-right tabular-nums">{o.totalOverrun.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function GangResults({ result, unit, margin, gapAcross, colorOf, onMove, onReset }) {
  const [dragging, setDragging] = useState(null);
  if (!result) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-8 text-center">
        <Rows3 className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="font-display text-base font-semibold text-slate-700 dark:text-slate-300">No gang plan yet</p>
        <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          List the SKUs sharing the run with their ordered quantities. Whatever will not fit the press width is split
          onto further plates, and each plate is planned so its SKUs finish together.
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
  const t = result.totals;
  const priced = result.rankedBy === "cost";

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${priced ? "xl:grid-cols-7" : "xl:grid-cols-6"}`}>
        <Stat
          label="Plates needed"
          value={t.plates}
          sub={t.plates === 1 ? "everything on one plate" : `${t.skus} SKUs split across ${t.plates}`}
          tone={t.plates > 1 ? "warn" : "good"}
        />
        <Stat label="SKUs" value={t.skus} sub={`${t.ordered.toLocaleString()} labels ordered`} />
        <Stat
          label="Overrun"
          value={formatPercent(t.overrunPct)}
          tone={t.overrunPct > 0.15 ? "bad" : t.overrunPct > 0.05 ? "warn" : "good"}
          sub={`${t.overrun.toLocaleString()} labels`}
        />
        <Stat label="Material" value={formatArea(t.materialArea, unit)} sub="across all plates" />
        <Stat
          label="Web to run"
          value={`${(t.webLength / (unit === "mm" ? 1000 : 1)).toFixed(unit === "mm" ? 0 : 1)} ${unit === "mm" ? "m" : u.label}`}
          sub={`${t.revolutions.toLocaleString()} turns total`}
        />
        {priced && (
          <Stat
            label="Per 1000"
            value={formatPaise(t.costPerThousand)}
            sub={`${formatPaise(t.plateCost)} plates + ${formatPaise(t.materialCost)} film`}
          />
        )}
        <Stat label="Grouped by" value={result.plates.length > 1 ? "split" : "one plate"} sub={result.strategy} />
      </div>

      {result.manual && onReset && (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs print:hidden">
          <span className="text-slate-600 dark:text-slate-400">
            You moved these SKUs yourself, so the planner is not choosing the grouping any more. Each plate is
            still solved properly.
          </span>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-300 hover:border-orange-500"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Back to the planner's split
          </button>
        </div>
      )}

      {t.plates > 1 && !result.manual && (
        <div className="border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 p-3 text-sm text-orange-900 dark:text-orange-200">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {t.skus} SKUs will not fit one plate — split across {t.plates}
          </div>
          <p className="text-xs">
            The split was chosen as “{result.strategy}”,{" "}
            {priced
              ? `the cheapest at ${formatPaise(t.totalCost)} all in — every extra plate buys another set, one per colour.`
              : "using the fewest plates that fit."}
          </p>
          {result.split && (
            <p className="mt-1.5 text-xs">
              {result.split.reason === "cylinder" ? (
                <>
                  Side by side they only need{" "}
                  <strong>{formatLength(result.split.neededWidth, unit)} {u.label}</strong> of web, which the press has
                  — but that means turning them, and turned,{" "}
                  <strong>{result.split.driverName}</strong> runs{" "}
                  <strong>{formatLength(result.split.neededRepeat, unit)} {u.label}</strong> down the web. That is a{" "}
                  <strong>{result.split.neededTeeth}-tooth</strong> cylinder and the largest on this press is{" "}
                  <strong>{result.split.biggestTeeth}T</strong> ({formatLength(result.split.biggestRepeat, unit)}{" "}
                  {u.label}). Lying the right way up they are far too wide to share, so the job splits. Add a bigger
                  cylinder and they go on one plate.
                </>
              ) : (
                <>
                  Even turned as narrow as they go they need{" "}
                  <strong>{formatLength(result.split.neededWidth, unit)} {u.label}</strong> of web, and the press prints{" "}
                  <strong>{formatLength(result.split.widest, unit)} {u.label}</strong>. A wider press, or fewer SKUs in
                  the run, is what puts them together.
                </>
              )}
            </p>
          )}
        </div>
      )}

      {onMove && (
        <p className="px-1 text-xs text-slate-500 dark:text-slate-400 print:hidden">
          Use the <strong>move</strong> box on any row to send a SKU to another plate, to one of its own, or off
          the run — or drag the row onto another plate if you prefer. Either way the plates are worked out again
          from scratch: the grouping is yours, the layout is still solved.
        </p>
      )}

      {result.plates.map((plate) => (
        <PlateCard
          key={plate.index}
          plate={plate}
          total={result.plates.length}
          plateCount={result.plates.length}
          unit={unit}
          margin={margin}
          gapAcross={gapAcross}
          colorOf={colorOf}
          move={onMove}
          dragging={dragging}
          setDragging={setDragging}
        />
      ))}

      {onMove && dragging && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (id) onMove(id, "new");
          }}
          className="border-2 border-dashed border-orange-400 bg-orange-50/60 p-4 text-center text-xs text-orange-800 dark:text-orange-300 print:hidden"
        >
          Drop here to give it a plate of its own
        </div>
      )}

      {result.alternatives && result.alternatives.length > 1 && (
        <section className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:hidden">
          <header className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              Other ways to split
              <span className="ml-2 font-sans text-xs font-normal normal-case text-slate-500 dark:text-slate-400">
                planned in {result.elapsedMs} ms
              </span>
            </h3>
          </header>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-2 py-1.5 text-left font-medium">Grouping</th>
                  <th className="px-2 py-1.5 text-right font-medium">Plates</th>
                  <th className="px-2 py-1.5 text-right font-medium">Material</th>
                  <th className="px-2 py-1.5 text-right font-medium">Overrun</th>
                  {priced && <th className="px-2 py-1.5 text-right font-medium">Plates ₹</th>}
                  {priced && <th className="px-2 py-1.5 text-right font-medium">₹/1000</th>}
                </tr>
              </thead>
              <tbody>
                {result.alternatives.map((alt, i) => (
                  <tr key={i} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${i === 0 ? "bg-orange-50 dark:bg-orange-950/40 font-medium" : ""}`}>
                    <td className="px-2 py-1">{alt.strategy}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{alt.plates}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatArea(alt.materialArea, unit)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{alt.overrun.toLocaleString()}</td>
                    {priced && (
                      <td className="px-2 py-1 text-right tabular-nums text-slate-500 dark:text-slate-400">{formatPaise(alt.plateCost)}</td>
                    )}
                    {priced && (
                      <td className="px-2 py-1 text-right tabular-nums">{formatPaise(alt.costPerThousand)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
