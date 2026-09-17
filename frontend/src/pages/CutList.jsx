import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileUp,
  Loader2,
  Play,
  Printer,
  RotateCcw,
  Scissors,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import PartsTable from "@/components/cutlist/PartsTable";
import StockTable from "@/components/cutlist/StockTable";
import SettingsPanel from "@/components/cutlist/SettingsPanel";
import ResultsPanel from "@/components/cutlist/ResultsPanel";
import { colorForIndex } from "@/components/cutlist/SheetDiagram";
import { ToolButton } from "@/components/cutlist/fields";
import { optimize, validate } from "@/lib/cutlist/optimizer";
import { UNITS, getUnit } from "@/lib/cutlist/units";
import {
  DEFAULT_PROJECT,
  SAMPLE_PROJECT,
  convertProject,
  download,
  emptyPart,
  emptyStock,
  loadProject,
  parseRows,
  partsToCsv,
  resultToCsv,
  saveProject,
  stockToCsv,
} from "@/lib/cutlist/project";

const DEFAULT_VIEW = {
  showLabels: true,
  showDimensions: true,
  showCuts: false,
  showOffcuts: true,
};

function ImportDialog({ open, onClose, onImport }) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("parts");
  const [mode, setMode] = useState("replace");

  useEffect(() => {
    if (open) setText("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl border border-slate-300 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="font-display text-base font-semibold text-slate-900">Import rows</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-900" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-600">
            Paste rows copied from a spreadsheet, or CSV text. Columns are read as{" "}
            <code className="bg-slate-100 px-1">length, width, qty, label, material, grain</code>; a header row is
            detected automatically.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={"length,width,qty,label\n600,400,4,Side\n900,300,2,Shelf"}
            className="w-full border border-slate-300 p-2 font-mono text-xs outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30"
          />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-slate-600">Into</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="border border-slate-300 px-2 py-1"
              >
                <option value="parts">Parts required</option>
                <option value="stock">Stock sheets</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-slate-600">Mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="border border-slate-300 px-2 py-1">
                <option value="replace">Replace existing rows</option>
                <option value="append">Append to existing rows</option>
              </select>
            </label>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <ToolButton onClick={onClose}>Cancel</ToolButton>
          <ToolButton variant="primary" onClick={() => onImport(text, target, mode)} disabled={!text.trim()}>
            Import
          </ToolButton>
        </footer>
      </div>
    </div>
  );
}

export default function CutList() {
  const [project, setProject] = useState(() => loadProject() || DEFAULT_PROJECT());
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [importOpen, setImportOpen] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    document.title = "Cut List Optimizer — panel cutting layout calculator";
  }, []);

  useEffect(() => {
    saveProject(project);
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setStale(true);
  }, [project]);

  useEffect(() => {
    const hasMaterial = [...project.parts, ...project.stock].some((r) => (r.material || "").trim());
    if (hasMaterial) setShowMaterial(true);
    // Only inspect the loaded project once; the checkbox owns the state after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colorIndex = useMemo(() => {
    const map = new Map();
    project.parts.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [project.parts]);

  const colorFor = useCallback((rowId) => colorForIndex(colorIndex.get(rowId) ?? 0), [colorIndex]);

  const patch = (updates) => setProject((prev) => ({ ...prev, ...updates }));

  const runCalculate = useCallback(async () => {
    const errors = validate({ parts: project.parts, stock: project.stock, settings: project.settings });
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setBusy(true);
    // Yield once so the button shows its busy state before the solver blocks.
    await new Promise((r) => setTimeout(r, 16));
    try {
      const res = optimize({ parts: project.parts, stock: project.stock, settings: project.settings });
      setResult(res);
      setStale(false);
      if (res.unplaced.length) {
        toast.warning("Some parts did not fit on the available stock.");
      } else {
        toast.success(`${res.sheets.length} sheet${res.sheets.length === 1 ? "" : "s"} — ${(res.summary.utilisation * 100).toFixed(1)}% used`);
      }
    } catch (err) {
      toast.error("The optimiser hit an unexpected error. Check the input values.");
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, [project]);

  const changeUnit = (unitId) => setProject((prev) => convertProject(prev, unitId));

  const clearAll = () => {
    setProject({ ...DEFAULT_PROJECT(), parts: [emptyPart()], stock: [emptyStock()], unit: project.unit });
    setResult(null);
    toast.info("Project cleared.");
  };

  const loadSample = () => {
    setProject(convertProject(SAMPLE_PROJECT(), project.unit));
    setResult(null);
    toast.info("Sample kitchen carcass loaded.");
  };

  const handleImport = (text, target, mode) => {
    const { rows, skipped } = parseRows(text, target === "stock" ? "stock" : "part");
    if (!rows.length) {
      toast.error("No usable rows found. Each row needs a length and a width.");
      return;
    }
    if (target === "stock") {
      patch({ stock: mode === "append" ? [...project.stock.filter((s) => s.length !== ""), ...rows] : rows });
    } else {
      patch({
        parts: mode === "append" ? [...project.parts.filter((p) => p.length !== ""), ...rows, emptyPart()] : [...rows, emptyPart()],
      });
    }
    setImportOpen(false);
    toast.success(`Imported ${rows.length} row${rows.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}.`);
  };

  const exportCsv = () => {
    if (result && result.sheets.length) {
      download("cutlist-layout.csv", resultToCsv(result, project.unit));
      toast.success("Layout exported.");
      return;
    }
    const text = `# parts\n${partsToCsv(project.parts)}\n\n# stock\n${stockToCsv(project.stock)}\n`;
    download("cutlist-input.csv", text);
    toast.success("Input exported.");
  };

  const setGrainMode = (on) => {
    setProject((prev) => ({
      ...prev,
      settings: { ...prev.settings, considerGrain: on },
      parts: prev.parts.map((p) => ({ ...p, canRotate: !on })),
    }));
  };

  const unit = getUnit(project.unit);

  return (
    <div className="cutlist-page min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white print:static print:border-0">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-orange-600" />
            <div>
              <h1 className="font-display text-base font-bold leading-tight text-slate-900">Cut List Optimizer</h1>
              <p className="text-[11px] leading-tight text-slate-500">Panel cutting layout calculator</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 print:hidden">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              Units
              <select
                value={project.unit}
                onChange={(e) => changeUnit(e.target.value)}
                className="border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-orange-500"
              >
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.label})
                  </option>
                ))}
              </select>
            </label>

            <ToolButton onClick={loadSample} title="Load a sample project">
              <Sparkles className="h-4 w-4" /> Sample
            </ToolButton>
            <ToolButton onClick={() => setImportOpen(true)} title="Import rows from CSV or a spreadsheet">
              <FileUp className="h-4 w-4" /> Import
            </ToolButton>
            <ToolButton onClick={exportCsv} title="Export as CSV">
              <Download className="h-4 w-4" /> Export
            </ToolButton>
            <ToolButton onClick={() => window.print()} title="Print the layout" disabled={!result}>
              <Printer className="h-4 w-4" /> Print
            </ToolButton>
            <ToolButton onClick={clearAll} title="Clear the project">
              <RotateCcw className="h-4 w-4" /> Clear
            </ToolButton>
            <ToolButton variant="primary" onClick={runCalculate} disabled={busy} title="Calculate the best layout">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {busy ? "Calculating" : "Calculate"}
            </ToolButton>
          </div>
        </div>
        {stale && result && (
          <div className="border-t border-orange-200 bg-orange-50 px-4 py-1.5 text-center text-xs text-orange-800 print:hidden">
            The input has changed since this layout was calculated — press Calculate to refresh it.
          </div>
        )}
      </header>

      <main className="mx-auto grid max-w-[1800px] gap-4 p-4 lg:grid-cols-[minmax(420px,5fr)_8fr] print:block print:p-0">
        {/* min-w-0 lets the tables scroll inside their column instead of widening the page */}
        <div className="min-w-0 space-y-4 print:hidden">
          <PartsTable
            parts={project.parts}
            unit={project.unit}
            showMaterial={showMaterial}
            colorFor={colorFor}
            onChange={(parts) => patch({ parts })}
          />
          <StockTable
            stock={project.stock}
            unit={project.unit}
            showMaterial={showMaterial}
            onChange={(stock) => patch({ stock })}
          />
          <SettingsPanel
            settings={project.settings}
            unit={project.unit}
            showMaterial={showMaterial}
            onToggleMaterial={setShowMaterial}
            onChange={(settings) => {
              if (settings.considerGrain !== project.settings.considerGrain) {
                setGrainMode(settings.considerGrain);
                return;
              }
              patch({ settings });
            }}
          />
          <p className="px-1 text-xs leading-relaxed text-slate-500">
            Every cut is a full guillotine pass, the way a panel saw works. Lengths run along the X axis of the diagram
            and widths along the Y axis, with the grain following the length. Dimensions are in {unit.name.toLowerCase()}.
          </p>
        </div>

        <div className="min-w-0">
          <ResultsPanel
            result={result}
            unit={project.unit}
            colorFor={colorFor}
            options={view}
            onOptionChange={setView}
          />
        </div>
      </main>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />
    </div>
  );
}
