import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Play, Printer, RotateCcw, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";
import PressSettings from "@/components/flexo/PressSettings";
import StepRepeatResults from "@/components/flexo/StepRepeatResults";
import GangResults from "@/components/flexo/GangResults";
import PartsTable from "@/components/cutlist/PartsTable";
import StockTable from "@/components/cutlist/StockTable";
import ResultsPanel from "@/components/cutlist/ResultsPanel";
import { colorForIndex } from "@/components/cutlist/SheetDiagram";
import { CheckCell, IconButton, NumberCell, Panel, TextCell, ToolButton } from "@/components/cutlist/fields";
import { Lock, Plus, RotateCw, Trash2 } from "lucide-react";
import ShopRates, { DEFAULT_COSTING } from "@/components/flexo/ShopRates";
import SaveToOrder from "@/components/flexo/SaveToOrder";
import { getLayout } from "@/lib/vault/api";
import { layoutCostFn, formatPaise } from "@/lib/costing/costing";
import { solveStepRepeat, getPitch } from "@/lib/flexo/layout";
import { solvePlateSets } from "@/lib/flexo/plates";
import { exportGangReport } from "@/lib/flexo/report";
import { optimize } from "@/lib/cutlist/optimizer";
import { convert, getUnit } from "@/lib/cutlist/units";
import { emptyPart, emptyStock, newId } from "@/lib/cutlist/project";

const STORAGE_KEY = "flexo.project.v1";
const FLEXO_UNITS = ["mm", "in"];

/** Common photopolymer plate sheet sizes, in millimetres. */
const PLATE_SHEETS_MM = [
  { label: "635 × 762 (25×30 in)", length: 635, width: 762 },
  { label: "762 × 1016 (30×40 in)", length: 762, width: 1016 },
  { label: "900 × 1200", length: 900, width: 1200 },
  { label: "1067 × 1524 (42×60 in)", length: 1067, width: 1524 },
  { label: "1270 × 2032 (50×80 in)", length: 1270, width: 2032 },
];

const newWeb = (over = {}) => ({ id: newId("web"), width: "", label: "", enabled: true, ...over });
const newSku = (over = {}) => ({
  id: newId("sku"),
  name: "",
  width: "",
  height: "",
  qty: "",
  canRotate: true,
  enabled: true,
  ...over,
});

const DEFAULT_PROJECT = () => ({
  unit: "mm",
  tab: "repeat",
  label: { width: 100, height: 60, canRotate: true },
  quantity: 100000,
  costing: DEFAULT_COSTING(),
  press: {
    webMode: "range",
    minWidth: 320,
    maxWidth: 650,
    webs: [newWeb({ width: 330, label: "330 slit" }), newWeb({ width: 430, label: "430 slit" })],
    cylinderMode: "list",
    teethList: "96, 104, 112, 120, 128, 136",
    minTeeth: 60,
    maxTeeth: 200,
    pitchId: "eighth",
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    distributeAcross: false,
  },
  skus: [
    newSku({ name: "Front label", width: 100, height: 60, qty: 90000 }),
    newSku({ name: "Back label", width: 100, height: 60, qty: 30000 }),
    newSku({ name: "Neck label", width: 60, height: 40, qty: 45000 }),
  ],
  plates: {
    parts: [
      emptyPart({ length: 320, width: 220, qty: 4, label: "Job A — CMYK" }),
      emptyPart({ length: 280, width: 180, qty: 2, label: "Job B — spot" }),
      emptyPart(),
    ],
    stock: [emptyStock({ length: 1067, width: 1524, qty: 0, label: "42×60 in plate" })],
    settings: { kerf: 2, trim: 0, objective: "sheets", effort: "balanced", considerGrain: false },
  },
});

const TABS = [
  { id: "repeat", label: "Step & repeat", hint: "One label — best web, cylinder and layout" },
  { id: "gang", label: "Gang run", hint: "Several SKUs sharing one web and plate set" },
  { id: "plates", label: "Plate nesting", hint: "Fit plate pieces onto photopolymer sheets" },
];

function SkuTable({ skus, unit, colorOf, onChange }) {
  const update = (id, patch) => onChange(skus.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const u = getUnit(unit);
  return (
    <Panel
      title="SKUs in the run"
      subtitle={`Label sizes in ${u.name.toLowerCase()}, with the quantity ordered`}
      actions={
        <ToolButton variant="ghost" onClick={() => onChange([...skus, newSku()])}>
          <Plus className="h-4 w-4" /> Add
        </ToolButton>
      }
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="w-8 px-2 py-1.5">
                <span className="sr-only">Enabled</span>
              </th>
              <th className="px-2 py-1.5 text-left font-medium">SKU</th>
              <th className="px-2 py-1.5 text-right font-medium">Width</th>
              <th className="px-2 py-1.5 text-right font-medium">Height</th>
              <th className="px-2 py-1.5 text-right font-medium">Ordered</th>
              <th className="w-9 px-1 py-1.5" />
              <th className="w-10 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {skus.map((s, i) => (
              <tr key={s.id} className={`border-b border-slate-100 last:border-0 ${s.enabled === false ? "opacity-45" : ""}`}>
                <td className="px-2 text-center">
                  <CheckCell checked={s.enabled !== false} onChange={(v) => update(s.id, { enabled: v })} title="Include this SKU" />
                </td>
                <td className="border-l border-slate-100 p-0">
                  <div className="flex items-center">
                    <span
                      className="ml-2 inline-block h-3 w-3 shrink-0 border border-slate-300"
                      style={{ background: colorOf(s.id) }}
                      aria-hidden="true"
                    />
                    <TextCell value={s.name} onChange={(v) => update(s.id, { name: v })} placeholder={`SKU ${i + 1}`} aria-label={`SKU ${i + 1} name`} />
                  </div>
                </td>
                <td className="border-l border-slate-100 p-0">
                  <NumberCell value={s.width} onChange={(v) => update(s.id, { width: v })} placeholder="width" aria-label={`SKU ${i + 1} width`} />
                </td>
                <td className="border-l border-slate-100 p-0">
                  <NumberCell value={s.height} onChange={(v) => update(s.id, { height: v })} placeholder="height" aria-label={`SKU ${i + 1} height`} />
                </td>
                <td className="border-l border-slate-100 p-0">
                  <NumberCell value={s.qty} onChange={(v) => update(s.id, { qty: v })} placeholder="qty" aria-label={`SKU ${i + 1} quantity`} />
                </td>
                <td className="border-l border-slate-100 px-1 text-center">
                  <IconButton
                    onClick={() => update(s.id, { canRotate: s.canRotate === false })}
                    title={s.canRotate === false ? "Orientation fixed" : "May be turned 90°"}
                    className={s.canRotate === false ? "text-orange-600" : ""}
                  >
                    {s.canRotate === false ? <Lock className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
                  </IconButton>
                </td>
                <td className="px-1 text-right">
                  <IconButton
                    onClick={() => onChange(skus.length > 1 ? skus.filter((x) => x.id !== s.id) : skus)}
                    title="Remove SKU"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function Flexo() {
  const [project, setProject] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // Rates were added after the first release, so a saved project needs
        // the defaults filled in under whatever it already had.
        return {
          ...DEFAULT_PROJECT(),
          ...saved,
          costing: { ...DEFAULT_COSTING(), ...(saved.costing || {}), film: { ...DEFAULT_COSTING().film, ...(saved.costing?.film || {}) } },
        };
      }
    } catch {
      /* storage unavailable — start fresh */
    }
    return DEFAULT_PROJECT();
  });
  const [repeatResult, setRepeatResult] = useState(null);
  const [gangResult, setGangResult] = useState(null);
  const [plateResult, setPlateResult] = useState(null);
  const [selectedRepeat, setSelectedRepeat] = useState(0);
  const [selectedGang, setSelectedGang] = useState(0);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState({ showLabels: true, showDimensions: true, showCuts: false, showOffcuts: true });

  const tab = project.tab;
  const unit = project.unit;
  const u = getUnit(unit);

  useEffect(() => {
    document.title = "Flexo Label Optimizer — step & repeat, gang runs, plate nesting";
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      /* ignore */
    }
  }, [project]);

  const patch = (updates) => setProject((prev) => ({ ...prev, ...updates }));

  const skuColorIndex = useMemo(() => {
    const map = new Map();
    project.skus.forEach((s, i) => map.set(s.id, i));
    return map;
  }, [project.skus]);
  const colorOf = useCallback((id) => colorForIndex(skuColorIndex.get(id) ?? 0), [skuColorIndex]);

  const plateColorIndex = useMemo(() => {
    const map = new Map();
    project.plates.parts.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [project.plates.parts]);
  const plateColorFor = useCallback((id) => colorForIndex(plateColorIndex.get(id) ?? 0), [plateColorIndex]);

  const pressArgs = useCallback(() => {
    const p = project.press;
    const range = (p.webMode || "range") === "range";
    return {
      webs: range ? [] : p.webs,
      webRange: range ? { min: p.minWidth, max: p.maxWidth } : null,
      cylinders:
        p.cylinderMode === "list"
          ? { teeth: String(p.teethList || "").split(/[,\s]+/).filter(Boolean) }
          : { minTeeth: p.minTeeth, maxTeeth: p.maxTeeth },
      gapAcross: p.gapAcross,
      gapAround: p.gapAround,
      edgeMargin: p.edgeMargin,
      // The engines work in whatever unit the page is in, so convert the pitch.
      pitch: convert(getPitch(p.pitchId).mm, "mm", unit),
    };
  }, [project.press, unit]);

  /**
   * The solver knows nothing about money — it is handed a pricing function and
   * ranks on what comes back, so the unit conversion stays here where the unit
   * is known.
   */
  const costFn = useCallback(() => {
    const c = project.costing;
    if (!c || c.enabled === false) return null;
    return layoutCostFn({
      unit,
      colours: c.colours,
      sets: c.sets,
      quantity: project.quantity,
      rates: { plateRatePerCm2: c.plateRatePerCm2, mountingPerPlate: 0, film: c.film },
    });
  }, [project.costing, project.quantity, unit]);

  /**
   * The record the save panel would write, built from whichever tab is open.
   *
   * A gang plan over several plates has no single repeat or cylinder, so those
   * fields stay empty rather than being filled with the first plate's and read
   * later as if they described the whole job.
   */
  const layoutDraft = useMemo(() => {
    const shared = {
      unit,
      colours: parseInt(project.costing?.colours, 10) || null,
      plate_sets: parseInt(project.costing?.sets, 10) || 1,
      payload: {
        label: project.label,
        press: project.press,
        costing: project.costing,
        quantity: project.quantity,
        skus: project.skus,
        tab,
      },
    };

    if (tab === "repeat" && repeatResult?.ok) {
      const o = repeatResult.options[selectedRepeat] || repeatResult.best;
      const priced = repeatResult.rankedBy === "cost";
      return {
        ...shared,
        kind: "step_repeat",
        label_width: Number(project.label.width) || null,
        label_height: Number(project.label.height) || null,
        quantity: parseInt(project.quantity, 10) || null,
        web_width: o.webWidth,
        repeat_mm: o.repeat,
        teeth: o.teeth,
        across: o.across,
        around: o.around,
        per_rev: o.perRev,
        rotated: !!o.rotated,
        utilisation: o.utilisation,
        material_area: o.materialArea,
        web_length: o.webLength,
        revolutions: o.revolutions,
        overrun: o.overrun,
        plate_area_cm2: priced ? o.plateAreaCm2 : null,
        plate_cost_minor: priced ? Math.round(o.plateCost * 100) : null,
        material_cost_minor: priced ? Math.round(o.materialCost * 100) : null,
        total_cost_minor: priced ? Math.round(o.totalCost * 100) : null,
        per_thousand_minor: priced ? Math.round(o.costPerThousand * 100) : null,
        ranked_by: repeatResult.rankedBy,
        suggestedName: `${o.across} × ${o.around} on ${o.teeth}T`,
        describe:
          `${o.across} × ${o.around} on a ${o.teeth}T cylinder, ${o.webWidth} ${unit} web` +
          (priced ? ` — ${formatPaise(o.costPerThousand)} per 1000` : ""),
      };
    }

    if (tab === "gang" && gangResult?.ok) {
      const t = gangResult.totals;
      const priced = gangResult.rankedBy === "cost";
      const single = gangResult.plates.length === 1 ? gangResult.plates[0].plan : null;
      return {
        ...shared,
        kind: "gang",
        quantity: t.ordered,
        web_width: single ? single.webWidth : null,
        repeat_mm: single ? single.repeat : null,
        teeth: single ? single.teeth : null,
        per_rev: single ? single.perRev : null,
        utilisation: single ? single.utilisation : null,
        material_area: t.materialArea,
        web_length: t.webLength,
        revolutions: t.revolutions,
        overrun: t.overrun,
        plate_cost_minor: priced ? Math.round(t.plateCost * 100) : null,
        material_cost_minor: priced ? Math.round(t.materialCost * 100) : null,
        total_cost_minor: priced ? Math.round(t.totalCost * 100) : null,
        per_thousand_minor: priced ? Math.round(t.costPerThousand * 100) : null,
        ranked_by: gangResult.rankedBy,
        suggestedName: `${t.plates} plate${t.plates === 1 ? "" : "s"}, ${t.skus} SKUs`,
        describe:
          `${t.skus} SKUs on ${t.plates} plate${t.plates === 1 ? "" : "s"}, ${t.overrun.toLocaleString()} over` +
          (priced ? ` — ${formatPaise(t.costPerThousand)} per 1000` : ""),
      };
    }
    return null;
  }, [tab, unit, project, repeatResult, gangResult, selectedRepeat]);

  /**
   * Put a saved layout back on the page. The stored payload is the whole
   * project, so what comes back is editable input rather than a read-only
   * record of a number somebody once got.
   */
  const openLayout = useCallback((layout) => {
    const p = layout?.payload;
    if (!p) {
      toast.error("That layout was saved without its settings and cannot be reopened.");
      return;
    }
    setProject((prev) => ({
      ...prev,
      tab: p.tab || (layout.kind === "gang" ? "gang" : "repeat"),
      unit: layout.unit || prev.unit,
      label: { ...prev.label, ...(p.label || {}) },
      press: { ...prev.press, ...(p.press || {}) },
      costing: { ...DEFAULT_COSTING(), ...(p.costing || {}), film: { ...DEFAULT_COSTING().film, ...(p.costing?.film || {}) } },
      quantity: p.quantity ?? prev.quantity,
      skus: p.skus?.length ? p.skus : prev.skus,
    }));
    setRepeatResult(null);
    setGangResult(null);
    setSelectedRepeat(0);
    setSelectedGang(0);
    toast.success(`${layout.name} loaded — press Calculate to work it out again.`);
  }, []);

  // A layout can be opened straight from the vault by its id.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("layout");
    if (!id) return;
    getLayout(id)
      .then(openLayout)
      .catch(() => toast.error("Could not open that layout. Sign in to the vault first."));
  }, [openLayout]);

  const calculate = useCallback(async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 16));
    try {
      if (tab === "repeat") {
        const res = solveStepRepeat({
          ...pressArgs(),
          label: project.label,
          distributeAcross: project.press.distributeAcross,
          quantity: project.quantity,
          cost: costFn(),
        });
        setRepeatResult(res);
        setSelectedRepeat(0);
        if (res.ok) {
          const b = res.best;
          toast.success(
            `${b.across} × ${b.around} on a ${b.teeth}T cylinder` +
              (res.rankedBy === "cost" ? ` — ${formatPaise(b.costPerThousand)} per 1000` : "")
          );
        } else toast.error(res.errors[0]);
      } else if (tab === "gang") {
        const res = solvePlateSets({ ...pressArgs(), skus: project.skus, cost: costFn() });
        setGangResult(res);
        setSelectedGang(0);
        if (res.ok) {
          const p = res.totals.plates;
          toast.success(
            `${p} plate${p === 1 ? "" : "s"}, ${res.totals.overrun.toLocaleString()} labels over` +
              (res.rankedBy === "cost" ? ` — ${formatPaise(res.totals.costPerThousand)} per 1000` : "")
          );
        } else {
          toast.error(res.errors[0]);
        }
      } else {
        const res = optimize({
          parts: project.plates.parts,
          stock: project.plates.stock,
          settings: project.plates.settings,
        });
        setPlateResult(res);
        if (res.unplaced.length) toast.warning("Some plate pieces did not fit.");
        else toast.success(`${res.sheets.length} plate sheet${res.sheets.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error("The calculation hit an unexpected error. Check the input values.");
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, [tab, pressArgs, costFn, project]);

  const exportReport = () => {
    if (!gangResult || !gangResult.ok) {
      toast.error("Calculate a gang plan first.");
      return;
    }
    try {
      exportGangReport({
        result: gangResult,
        press: project.press,
        unit,
        skus: project.skus,
        projectName: `${gangResult.totals.skus} SKUs, ${gangResult.totals.plates} plate${gangResult.totals.plates === 1 ? "" : "s"}`,
      });
      toast.success("Report downloaded.");
    } catch (err) {
      toast.error("Could not build the report.");
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const changeUnit = (next) => {
    if (next === unit) return;
    const c = (v) => (v === "" || v === null || v === undefined ? v : convert(v, unit, next));
    setProject((prev) => ({
      ...prev,
      unit: next,
      label: { ...prev.label, width: c(prev.label.width), height: c(prev.label.height) },
      press: {
        ...prev.press,
        webs: prev.press.webs.map((w) => ({ ...w, width: c(w.width) })),
        gapAcross: c(prev.press.gapAcross),
        gapAround: c(prev.press.gapAround),
        edgeMargin: c(prev.press.edgeMargin),
      },
      skus: prev.skus.map((s) => ({ ...s, width: c(s.width), height: c(s.height) })),
      plates: {
        ...prev.plates,
        parts: prev.plates.parts.map((p) => ({ ...p, length: c(p.length), width: c(p.width) })),
        stock: prev.plates.stock.map((s) => ({ ...s, length: c(s.length), width: c(s.width) })),
        settings: { ...prev.plates.settings, kerf: c(prev.plates.settings.kerf), trim: c(prev.plates.settings.trim) },
      },
    }));
    setRepeatResult(null);
    setGangResult(null);
    setPlateResult(null);
  };

  const platePresets = useMemo(
    () =>
      PLATE_SHEETS_MM.map((p) => ({
        label: p.label,
        length: convert(p.length, "mm", unit),
        width: convert(p.width, "mm", unit),
      })),
    [unit]
  );

  const numberField =
    "w-full border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30";

  return (
    <div className="cutlist-page min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white print:static">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-orange-600" />
            <div>
              <h1 className="font-display text-base font-bold leading-tight">Flexo Label Optimizer</h1>
              <p className="text-[11px] leading-tight text-slate-500">Step &amp; repeat, gang runs and plate nesting</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 print:hidden">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              Units
              <select
                value={unit}
                onChange={(e) => changeUnit(e.target.value)}
                className="border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-orange-500"
              >
                {FLEXO_UNITS.map((id) => (
                  <option key={id} value={id}>
                    {getUnit(id).name}
                  </option>
                ))}
              </select>
            </label>
            <ToolButton
              onClick={() => {
                setProject({ ...DEFAULT_PROJECT(), tab, unit: "mm" });
                setRepeatResult(null);
                setGangResult(null);
                setPlateResult(null);
                toast.info("Reset to the sample press setup.");
              }}
            >
              <Sparkles className="h-4 w-4" /> Sample
            </ToolButton>
            {tab === "gang" && (
              <ToolButton onClick={exportReport} disabled={!gangResult || !gangResult.ok} title="Download the full report as a PDF">
                <FileText className="h-4 w-4" /> Export PDF
              </ToolButton>
            )}
            <ToolButton onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </ToolButton>
            <ToolButton variant="primary" onClick={calculate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {busy ? "Calculating" : "Calculate"}
            </ToolButton>
          </div>
        </div>

        <nav className="mx-auto flex max-w-[1800px] gap-1 px-4 print:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => patch({ tab: t.id })}
              title={t.hint}
              className={`border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === t.id
                  ? "border-orange-600 font-semibold text-orange-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto grid max-w-[1800px] gap-4 p-4 lg:grid-cols-[minmax(400px,4fr)_7fr] print:block print:p-0">
        <div className="min-w-0 space-y-4 print:hidden">
          {tab === "repeat" && (
            <>
              <Panel title="Label" subtitle="Width runs across the web, height runs around the cylinder">
                <div className="grid grid-cols-2 gap-3 p-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-700">Width across ({u.label})</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={numberField}
                      value={project.label.width}
                      onChange={(e) => patch({ label: { ...project.label, width: e.target.value.replace(",", ".") } })}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-700">Height around ({u.label})</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={numberField}
                      value={project.label.height}
                      onChange={(e) => patch({ label: { ...project.label, height: e.target.value.replace(",", ".") } })}
                    />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-700">Order quantity (labels)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={numberField}
                      value={project.quantity}
                      onChange={(e) => patch({ quantity: e.target.value.replace(/[^\d]/g, "") })}
                    />
                  </label>
                </div>
                <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={project.label.canRotate !== false}
                    onChange={(e) => patch({ label: { ...project.label, canRotate: e.target.checked } })}
                    className="h-4 w-4 cursor-pointer accent-orange-600"
                  />
                  Allow the label to be turned 90°
                </label>
              </Panel>
              <PressSettings press={project.press} unit={unit} onChange={(press) => patch({ press })} newWeb={newWeb} />
              <ShopRates costing={project.costing} onChange={(costing) => patch({ costing })} />
              <SaveToOrder draft={layoutDraft} onOpen={openLayout} />
            </>
          )}

          {tab === "gang" && (
            <>
              <SkuTable skus={project.skus} unit={unit} colorOf={colorOf} onChange={(skus) => patch({ skus })} />
              <PressSettings press={project.press} unit={unit} onChange={(press) => patch({ press })} newWeb={newWeb} />
              <ShopRates costing={project.costing} onChange={(costing) => patch({ costing })} />
              <SaveToOrder draft={layoutDraft} onOpen={openLayout} />
            </>
          )}

          {tab === "plates" && (
            <>
              <PartsTable
                parts={project.plates.parts}
                unit={unit}
                showMaterial={false}
                colorFor={plateColorFor}
                onChange={(parts) => patch({ plates: { ...project.plates, parts } })}
                title="Plate pieces"
                subtitle="One row per job or colour — length × width of the mounted plate"
              />
              <StockTable
                stock={project.plates.stock}
                unit={unit}
                showMaterial={false}
                onChange={(stock) => patch({ plates: { ...project.plates, stock } })}
                title="Plate sheets"
                subtitle="Photopolymer sheet stock — quantity 0 means unlimited"
                presets={platePresets}
              />
              <Panel title="Plate cutting">
                <div className="grid grid-cols-2 gap-3 p-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-700">Cutting allowance ({u.label})</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={numberField}
                      value={project.plates.settings.kerf}
                      onChange={(e) =>
                        patch({
                          plates: {
                            ...project.plates,
                            settings: { ...project.plates.settings, kerf: e.target.value.replace(",", ".") },
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-700">Sheet edge trim ({u.label})</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={numberField}
                      value={project.plates.settings.trim}
                      onChange={(e) =>
                        patch({
                          plates: {
                            ...project.plates,
                            settings: { ...project.plates.settings, trim: e.target.value.replace(",", ".") },
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </Panel>
            </>
          )}
        </div>

        <div className="min-w-0">
          {tab === "repeat" && (
            <StepRepeatResults
              result={repeatResult}
              unit={unit}
              margin={parseFloat(project.press.edgeMargin) || 0}
              selected={selectedRepeat}
              onSelect={setSelectedRepeat}
              quantity={parseInt(project.quantity, 10) || 0}
            />
          )}
          {tab === "gang" && (
            <GangResults
              result={gangResult}
              unit={unit}
              margin={parseFloat(project.press.edgeMargin) || 0}
              gapAcross={parseFloat(project.press.gapAcross) || 0}
              colorOf={colorOf}
            />
          )}
          {tab === "plates" && (
            <ResultsPanel
              result={plateResult}
              unit={unit}
              colorFor={plateColorFor}
              options={view}
              onOptionChange={setView}
            />
          )}
        </div>
      </main>
    </div>
  );
}
