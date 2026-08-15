import React from "react";
import { Copy, Lock, Plus, RotateCw, Trash2 } from "lucide-react";
import { CheckCell, IconButton, NumberCell, Panel, TextCell, ToolButton } from "./fields";
import { emptyPart, parseRows } from "@/lib/cutlist/project";
import { formatArea, getUnit } from "@/lib/cutlist/units";

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export default function PartsTable({
  parts,
  unit,
  showMaterial,
  colorFor,
  onChange,
  title = "Parts required",
  subtitle,
}) {
  const update = (id, patch) => onChange(parts.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addRow = () => onChange([...parts, emptyPart()]);

  const removeRow = (id) => {
    const next = parts.filter((p) => p.id !== id);
    onChange(next.length ? next : [emptyPart()]);
  };

  const duplicateRow = (id) => {
    const i = parts.findIndex((p) => p.id === id);
    if (i < 0) return;
    const copy = { ...parts[i], id: emptyPart().id };
    onChange([...parts.slice(0, i + 1), copy, ...parts.slice(i + 1)]);
  };

  /** A paste of several lines replaces the row it landed on and the ones after it. */
  const pasteInto = (id, text) => {
    const { rows } = parseRows(text, "part");
    if (!rows.length) return;
    const i = parts.findIndex((p) => p.id === id);
    const before = parts.slice(0, Math.max(0, i));
    onChange([...before, ...rows, emptyPart()]);
  };

  /** Typing in the last row opens a fresh one, so the table always has space. */
  const ensureTrailingRow = (id) => {
    if (parts.length && parts[parts.length - 1].id === id) onChange([...parts, emptyPart()]);
  };

  const filled = parts.filter((p) => num(p.length) > 0 && num(p.width) > 0 && p.enabled !== false);
  const totalPieces = filled.reduce((s, p) => s + Math.max(0, Math.floor(num(p.qty))), 0);
  const totalArea = filled.reduce((s, p) => s + num(p.length) * num(p.width) * Math.max(0, Math.floor(num(p.qty))), 0);
  const u = getUnit(unit);

  return (
    <Panel
      title={title}
      subtitle={subtitle || `Dimensions in ${u.name.toLowerCase()}`}
      actions={
        <ToolButton onClick={addRow} variant="ghost" title="Add a part row">
          <Plus className="h-4 w-4" /> Add
        </ToolButton>
      }
    >
      <div className="relative overflow-x-auto">
        {/* The minimum width keeps the number cells legible; narrow screens scroll. */}
        <table className={`w-full border-collapse text-sm ${showMaterial ? "min-w-[660px]" : "min-w-[560px]"}`}>
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="w-8 px-2 py-1.5" title="Include this row in the calculation">
                <span className="sr-only">Enabled</span>
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Length</th>
              <th className="px-2 py-1.5 text-right font-medium">Width</th>
              <th className="w-16 px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2 py-1.5 text-left font-medium">Label</th>
              {showMaterial && <th className="px-2 py-1.5 text-left font-medium">Material</th>}
              <th className="w-9 px-1 py-1.5 text-center font-medium" title="Grain direction">
                <span className="sr-only">Grain</span>
              </th>
              <th className="w-[72px] px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {parts.map((p, index) => {
              const dim = num(p.length) > 0 && num(p.width) > 0;
              return (
                <tr
                  key={p.id}
                  className={`border-b border-slate-100 last:border-0 ${p.enabled === false ? "opacity-45" : ""}`}
                >
                  <td className="px-2 text-center">
                    <CheckCell
                      checked={p.enabled !== false}
                      onChange={(v) => update(p.id, { enabled: v })}
                      title="Include this part"
                    />
                  </td>
                  <td className="border-l border-slate-100 p-0">
                    <div className="flex items-center">
                      {dim && (
                        <span
                          className="ml-2 inline-block h-3 w-3 shrink-0 border border-slate-300"
                          style={{ background: colorFor(p.id) }}
                          aria-hidden="true"
                        />
                      )}
                      <NumberCell
                        value={p.length}
                        onChange={(v) => {
                          update(p.id, { length: v });
                          ensureTrailingRow(p.id);
                        }}
                        onPasteRows={(t) => pasteInto(p.id, t)}
                        placeholder="length"
                        aria-label={`Part ${index + 1} length`}
                      />
                    </div>
                  </td>
                  <td className="border-l border-slate-100 p-0">
                    <NumberCell
                      value={p.width}
                      onChange={(v) => {
                        update(p.id, { width: v });
                        ensureTrailingRow(p.id);
                      }}
                      onPasteRows={(t) => pasteInto(p.id, t)}
                      placeholder="width"
                      aria-label={`Part ${index + 1} width`}
                    />
                  </td>
                  <td className="border-l border-slate-100 p-0">
                    <NumberCell
                      value={p.qty}
                      onChange={(v) => update(p.id, { qty: v })}
                      placeholder="1"
                      aria-label={`Part ${index + 1} quantity`}
                    />
                  </td>
                  <td className="border-l border-slate-100 p-0">
                    <TextCell
                      value={p.label}
                      onChange={(v) => update(p.id, { label: v })}
                      placeholder="optional"
                      aria-label={`Part ${index + 1} label`}
                    />
                  </td>
                  {showMaterial && (
                    <td className="border-l border-slate-100 p-0">
                      <TextCell
                        value={p.material}
                        onChange={(v) => update(p.id, { material: v })}
                        placeholder="any"
                        aria-label={`Part ${index + 1} material`}
                      />
                    </td>
                  )}
                  <td className="border-l border-slate-100 px-1 text-center">
                    <IconButton
                      onClick={() => update(p.id, { canRotate: p.canRotate === false })}
                      title={
                        p.canRotate === false
                          ? "Grain fixed — this part may not be rotated"
                          : "Free orientation — this part may be rotated 90°"
                      }
                      className={p.canRotate === false ? "text-orange-600" : ""}
                    >
                      {p.canRotate === false ? <Lock className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
                    </IconButton>
                  </td>
                  <td className="whitespace-nowrap px-1 text-right">
                    <IconButton onClick={() => duplicateRow(p.id)} title="Duplicate row">
                      <Copy className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton onClick={() => removeRow(p.id)} title="Delete row">
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
        <span>
          <strong className="tabular-nums text-slate-900">{totalPieces}</strong> pieces from{" "}
          <strong className="tabular-nums text-slate-900">{filled.length}</strong> sizes
        </span>
        <span>
          Total part area <strong className="tabular-nums text-slate-900">{formatArea(totalArea, unit)}</strong>
        </span>
      </footer>
    </Panel>
  );
}
