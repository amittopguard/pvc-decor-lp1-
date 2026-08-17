import React from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { CheckCell, IconButton, NumberCell, Panel, TextCell, ToolButton } from "./fields";
import { emptyStock, parseRows } from "@/lib/cutlist/project";
import { formatArea } from "@/lib/cutlist/units";

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export default function StockTable({
  stock,
  unit,
  showMaterial,
  onChange,
  title = "Stock sheets",
  subtitle = "Quantity 0 means an unlimited supply",
  presets,
}) {
  const update = (id, patch) => onChange(stock.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addRow = () => onChange([...stock, emptyStock()]);

  const removeRow = (id) => {
    const next = stock.filter((s) => s.id !== id);
    onChange(next.length ? next : [emptyStock()]);
  };

  const duplicateRow = (id) => {
    const i = stock.findIndex((s) => s.id === id);
    if (i < 0) return;
    onChange([...stock.slice(0, i + 1), { ...stock[i], id: emptyStock().id }, ...stock.slice(i + 1)]);
  };

  const pasteInto = (id, text) => {
    const { rows } = parseRows(text, "stock");
    if (!rows.length) return;
    const i = stock.findIndex((s) => s.id === id);
    onChange([...stock.slice(0, Math.max(0, i)), ...rows]);
  };

  const ensureTrailingRow = (id) => {
    if (stock.length && stock[stock.length - 1].id === id) onChange([...stock, emptyStock()]);
  };

  const filled = stock.filter((s) => num(s.length) > 0 && num(s.width) > 0 && s.enabled !== false);
  const unlimited = filled.some((s) => num(s.qty) <= 0);
  const totalSheets = filled.reduce((t, s) => t + Math.max(0, Math.floor(num(s.qty))), 0);
  const totalArea = filled.reduce((t, s) => t + num(s.length) * num(s.width) * Math.max(0, Math.floor(num(s.qty))), 0);

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      actions={
        <ToolButton onClick={addRow} variant="ghost" title="Add a stock sheet size">
          <Plus className="h-4 w-4" /> Add
        </ToolButton>
      }
    >
      <div className="relative overflow-x-auto">
        {/* The minimum width keeps the number cells legible; narrow screens scroll. */}
        <table className={`w-full border-collapse text-sm ${showMaterial ? "min-w-[620px]" : "min-w-[520px]"}`}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="w-8 px-2 py-1.5">
                <span className="sr-only">Enabled</span>
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Length</th>
              <th className="px-2 py-1.5 text-right font-medium">Width</th>
              <th className="w-16 px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2 py-1.5 text-left font-medium">Label</th>
              {showMaterial && <th className="px-2 py-1.5 text-left font-medium">Material</th>}
              <th className="w-[72px] px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {stock.map((s, index) => (
              <tr
                key={s.id}
                className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${s.enabled === false ? "opacity-45" : ""}`}
              >
                <td className="px-2 text-center">
                  <CheckCell
                    checked={s.enabled !== false}
                    onChange={(v) => update(s.id, { enabled: v })}
                    title="Use this stock size"
                  />
                </td>
                <td className="border-l border-slate-100 dark:border-slate-800 p-0">
                  <NumberCell
                    value={s.length}
                    onChange={(v) => {
                      update(s.id, { length: v });
                      ensureTrailingRow(s.id);
                    }}
                    onPasteRows={(t) => pasteInto(s.id, t)}
                    placeholder="length"
                    aria-label={`Stock ${index + 1} length`}
                  />
                </td>
                <td className="border-l border-slate-100 dark:border-slate-800 p-0">
                  <NumberCell
                    value={s.width}
                    onChange={(v) => {
                      update(s.id, { width: v });
                      ensureTrailingRow(s.id);
                    }}
                    onPasteRows={(t) => pasteInto(s.id, t)}
                    placeholder="width"
                    aria-label={`Stock ${index + 1} width`}
                  />
                </td>
                <td className="border-l border-slate-100 dark:border-slate-800 p-0">
                  <NumberCell
                    value={s.qty}
                    onChange={(v) => update(s.id, { qty: v })}
                    placeholder="0"
                    aria-label={`Stock ${index + 1} quantity`}
                  />
                </td>
                <td className="border-l border-slate-100 dark:border-slate-800 p-0">
                  <TextCell
                    value={s.label}
                    onChange={(v) => update(s.id, { label: v })}
                    placeholder="optional"
                    aria-label={`Stock ${index + 1} label`}
                  />
                </td>
                {showMaterial && (
                  <td className="border-l border-slate-100 dark:border-slate-800 p-0">
                    <TextCell
                      value={s.material}
                      onChange={(v) => update(s.id, { material: v })}
                      placeholder="any"
                      aria-label={`Stock ${index + 1} material`}
                    />
                  </td>
                )}
                <td className="whitespace-nowrap px-1 text-right">
                  <IconButton onClick={() => duplicateRow(s.id)} title="Duplicate row">
                    <Copy className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton onClick={() => removeRow(s.id)} title="Delete row">
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 px-3 py-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Standard sizes</span>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() =>
                onChange([
                  ...stock.filter((s) => num(s.length) > 0 && num(s.width) > 0),
                  emptyStock({ length: p.length, width: p.width, label: p.label, qty: 0 }),
                ])
              }
              className="border border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 hover:border-orange-500 hover:text-orange-700"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400">
        <span>
          {unlimited ? (
            "Unlimited supply available"
          ) : (
            <>
              <strong className="tabular-nums text-slate-900 dark:text-slate-100">{totalSheets}</strong> sheets in stock
            </>
          )}
        </span>
        {!unlimited && (
          <span>
            Total stock area <strong className="tabular-nums text-slate-900 dark:text-slate-100">{formatArea(totalArea, unit)}</strong>
          </span>
        )}
      </footer>
    </Panel>
  );
}
