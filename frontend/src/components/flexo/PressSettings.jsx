import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { CheckCell, IconButton, NumberCell, Panel, TextCell, ToolButton } from "@/components/cutlist/fields";
import { PITCHES, cylinderTeeth, getPitch } from "@/lib/flexo/layout";
import { convert, formatLength, getUnit } from "@/lib/cutlist/units";

const inputClass =
  "w-full border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none " +
  "focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30";

function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-slate-700" title={hint}>
        {label}
      </span>
      {children}
    </label>
  );
}

const decimal = (v, set) => (e) => {
  const val = e.target.value;
  if (val === "" || /^\d*[.,]?\d*$/.test(val)) set(val.replace(",", "."));
};

export default function PressSettings({ press, unit, onChange, newWeb }) {
  const set = (patch) => onChange({ ...press, ...patch });
  const u = getUnit(unit);
  const pitch = convert(getPitch(press.pitchId).mm, "mm", unit);
  const teeth = cylinderTeeth(
    press.cylinderMode === "list"
      ? { teeth: String(press.teethList || "").split(/[,\s]+/).filter(Boolean) }
      : { minTeeth: press.minTeeth, maxTeeth: press.maxTeeth }
  );
  const repeatLo = teeth.length ? teeth[0] * pitch : 0;
  const repeatHi = teeth.length ? teeth[teeth.length - 1] * pitch : 0;

  const updateWeb = (id, patch) =>
    set({ webs: press.webs.map((w) => (w.id === id ? { ...w, ...patch } : w)) });

  return (
    <>
      <Panel
        title="Print width"
        subtitle="The press slits to fit — anything under the minimum still costs the minimum"
        actions={
          press.webMode === "list" ? (
            <ToolButton variant="ghost" onClick={() => set({ webs: [...press.webs, newWeb()] })}>
              <Plus className="h-4 w-4" /> Add
            </ToolButton>
          ) : null
        }
      >
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap gap-4 text-sm">
            {[
              { id: "range", label: "Slit to any width in range" },
              { id: "list", label: "Only widths I stock" },
            ].map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="webMode"
                  checked={(press.webMode || "range") === m.id}
                  onChange={() => set({ webMode: m.id })}
                  className="h-4 w-4 cursor-pointer accent-orange-600"
                />
                {m.label}
              </label>
            ))}
          </div>

          {(press.webMode || "range") === "range" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Minimum print width (${u.label})`} hint="Narrower jobs still run — and still cost — this width">
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputClass}
                  value={press.minWidth}
                  onChange={decimal(press.minWidth, (v) => set({ minWidth: v }))}
                />
              </Field>
              <Field label={`Maximum print width (${u.label})`} hint="The widest the press can run">
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputClass}
                  value={press.maxWidth}
                  onChange={decimal(press.maxWidth, (v) => set({ maxWidth: v }))}
                />
              </Field>
            </div>
          ) : null}
        </div>

        {(press.webMode || "range") === "list" && (
          <div className="relative overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[320px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-8 px-2 py-1.5">
                    <span className="sr-only">Enabled</span>
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">Width ({u.label})</th>
                  <th className="px-2 py-1.5 text-left font-medium">Label</th>
                  <th className="w-10 px-1 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {press.webs.map((w, i) => (
                  <tr key={w.id} className={`border-b border-slate-100 last:border-0 ${w.enabled === false ? "opacity-45" : ""}`}>
                    <td className="px-2 text-center">
                      <CheckCell checked={w.enabled !== false} onChange={(v) => updateWeb(w.id, { enabled: v })} title="Consider this web width" />
                    </td>
                    <td className="border-l border-slate-100 p-0">
                      <NumberCell value={w.width} onChange={(v) => updateWeb(w.id, { width: v })} placeholder="330" aria-label={`Web ${i + 1} width`} />
                    </td>
                    <td className="border-l border-slate-100 p-0">
                      <TextCell value={w.label} onChange={(v) => updateWeb(w.id, { label: v })} placeholder="optional" aria-label={`Web ${i + 1} label`} />
                    </td>
                    <td className="px-1 text-right">
                      <IconButton
                        onClick={() => set({ webs: press.webs.length > 1 ? press.webs.filter((x) => x.id !== w.id) : press.webs })}
                        title="Remove web width"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Cylinder" subtitle="Repeat = teeth × pitch — on equal cost the smaller plate wins">
        <div className="space-y-3 p-3">
          <div className="flex gap-4 text-sm">
            {[
              { id: "list", label: "Cylinders I own" },
              { id: "range", label: "Any repeat in range" },
            ].map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="cylinderMode"
                  checked={press.cylinderMode === m.id}
                  onChange={() => set({ cylinderMode: m.id })}
                  className="h-4 w-4 cursor-pointer accent-orange-600"
                />
                {m.label}
              </label>
            ))}
          </div>

          {press.cylinderMode === "list" ? (
            <Field label="Teeth counts" hint="Comma separated, e.g. 96, 104, 120, 136">
              <input
                type="text"
                className={inputClass}
                value={press.teethList}
                onChange={(e) => set({ teethList: e.target.value })}
                placeholder="96, 104, 120, 136"
              />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum teeth">
                <input type="text" inputMode="numeric" className={inputClass} value={press.minTeeth} onChange={decimal(press.minTeeth, (v) => set({ minTeeth: v }))} />
              </Field>
              <Field label="Maximum teeth">
                <input type="text" inputMode="numeric" className={inputClass} value={press.maxTeeth} onChange={decimal(press.maxTeeth, (v) => set({ maxTeeth: v }))} />
              </Field>
            </div>
          )}

          <Field label="Gear pitch" hint="1/8 in is the narrow-web standard">
            <select className={inputClass} value={press.pitchId} onChange={(e) => set({ pitchId: e.target.value })}>
              {PITCHES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <p className="text-xs text-slate-500">
            {teeth.length ? (
              <>
                {teeth.length} cylinder{teeth.length === 1 ? "" : "s"} — repeat{" "}
                <strong className="tabular-nums text-slate-700">
                  {formatLength(repeatLo, unit)}
                  {teeth.length > 1 ? ` to ${formatLength(repeatHi, unit)}` : ""} {u.label}
                </strong>
              </>
            ) : (
              "No cylinders entered."
            )}
          </p>
        </div>
      </Panel>

      <Panel title="Gaps and margins">
        <div className="grid grid-cols-2 gap-3 p-3">
          <Field label={`Gutter across (${u.label})`} hint="Minimum space between lanes">
            <input type="text" inputMode="decimal" className={inputClass} value={press.gapAcross} onChange={decimal(press.gapAcross, (v) => set({ gapAcross: v }))} />
          </Field>
          <Field label={`Gap around (${u.label})`} hint="Minimum space between rows down-web; the real gap grows to fill the repeat">
            <input type="text" inputMode="decimal" className={inputClass} value={press.gapAround} onChange={decimal(press.gapAround, (v) => set({ gapAround: v }))} />
          </Field>
          <Field label={`Edge margin (${u.label})`} hint="Unprintable margin at each edge of the web" className="col-span-2">
            <input type="text" inputMode="decimal" className={inputClass} value={press.edgeMargin} onChange={decimal(press.edgeMargin, (v) => set({ edgeMargin: v }))} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-2 border-t border-slate-100 px-3 py-2">
          <input
            type="checkbox"
            checked={!!press.distributeAcross}
            onChange={(e) => set({ distributeAcross: e.target.checked })}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-orange-600"
          />
          <span>
            <span className="block text-sm text-slate-800">Spread spare width into the gutters</span>
            <span className="block text-xs text-slate-500">
              Off: leftover width stays at the edges as trim. On: lanes are spaced out to fill the web.
            </span>
          </span>
        </label>
      </Panel>
    </>
  );
}
