import React from "react";
import { Info } from "lucide-react";
import { Panel } from "./fields";
import { getUnit } from "@/lib/cutlist/units";

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
        {hint && (
          <span title={hint} className="text-slate-400 dark:text-slate-500">
            <Info className="h-3 w-3" />
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none " +
  "focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30";

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-orange-600"
      />
      <span>
        <span className="block text-sm text-slate-800 dark:text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

export default function SettingsPanel({ settings, unit, showMaterial, onToggleMaterial, onChange }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  const u = getUnit(unit);

  return (
    <Panel title="Settings">
      <div className="grid grid-cols-2 gap-3 p-3">
        <Field
          label={`Cut width / kerf (${u.label})`}
          hint="Thickness of material removed by the saw blade on every cut."
        >
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={settings.kerf ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*[.,]?\d*$/.test(v)) set({ kerf: v.replace(",", ".") });
            }}
          />
        </Field>

        <Field label={`Edge trim (${u.label})`} hint="Material trimmed off all four edges of every stock sheet before cutting.">
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={settings.trim ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*[.,]?\d*$/.test(v)) set({ trim: v.replace(",", ".") });
            }}
          />
        </Field>

        <Field label="Optimise for" hint="Fewest sheets keeps material cost down; fewest cuts keeps saw time down.">
          <select className={inputClass} value={settings.objective} onChange={(e) => set({ objective: e.target.value })}>
            <option value="sheets">Least material used</option>
            <option value="cuts">Fewest cuts</option>
          </select>
        </Field>

        <Field label="Search effort" hint="How many packing strategies are tried before the best layout is picked.">
          <select className={inputClass} value={settings.effort} onChange={(e) => set({ effort: e.target.value })}>
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="thorough">Thorough</option>
          </select>
        </Field>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2">
        <Toggle
          checked={settings.considerGrain}
          onChange={(v) => set({ considerGrain: v })}
          label="Respect grain direction"
          hint="Parts keep their orientation — length runs with the grain and rotation is off unless a row allows it."
        />
        <Toggle
          checked={showMaterial}
          onChange={onToggleMaterial}
          label="Use material column"
          hint="Keeps each material on its own sheets. Leave a row blank to let it go anywhere."
        />
      </div>
    </Panel>
  );
}
