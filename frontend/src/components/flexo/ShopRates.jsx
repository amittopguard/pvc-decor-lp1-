import React from "react";
import { CheckCell, NumberCell, Panel } from "@/components/cutlist/fields";
import { FILM_DENSITY, filmCostPerSqm, gsm, sqmPerKg, formatPaise } from "@/lib/costing/costing";

const FILMS = Object.keys(FILM_DENSITY);

/**
 * What the shop pays. Without these the optimiser can only rank layouts by the
 * material each label uses, which quietly favours the widest web — and the
 * widest web is also the most expensive plate.
 */
export default function ShopRates({ costing, onChange }) {
  const set = (patch) => onChange({ ...costing, ...patch });
  const setFilm = (patch) => onChange({ ...costing, film: { ...costing.film, ...patch } });
  const film = costing.film;
  const weight = gsm(film.micron, film.density);
  const perSqm = filmCostPerSqm(film);
  const yieldPerKg = sqmPerKg(film.micron, film.density);

  return (
    <Panel
      title="Shop rates"
      subtitle="Turn these on to rank layouts by cost per thousand instead of material used"
      actions={
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <CheckCell
            checked={costing.enabled !== false}
            onChange={(v) => set({ enabled: v })}
            title="Rank layouts by cost"
          />
          Price the layouts
        </label>
      }
    >
      <div className={`p-3 ${costing.enabled === false ? "pointer-events-none opacity-45" : ""}`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Colours</span>
            <NumberCell
              value={costing.colours}
              onChange={(v) => set({ colours: v })}
              aria-label="Colours in the job"
            />
            <span className="text-[11px] text-slate-500">one plate each</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Plate sets</span>
            <NumberCell value={costing.sets} onChange={(v) => set({ sets: v })} aria-label="Plate sets" />
            <span className="text-[11px] text-slate-500">1 unless the job needs more than one plate</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Plate rate (₹/cm²)</span>
            <NumberCell
              value={costing.plateRatePerCm2}
              onChange={(v) => set({ plateRatePerCm2: v })}
              aria-label="Plate rate per square centimetre"
            />
            <span className="text-[11px] text-slate-500">usually 1.2 to 1.4</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Film</span>
            <select
              className="w-full border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30"
              aria-label="Film material"
              value={film.material || "PVC"}
              onChange={(e) => setFilm({ material: e.target.value, density: FILM_DENSITY[e.target.value] })}
            >
              {FILMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500">density {film.density}</span>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Priced</span>
            <select
              className="w-full border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30"
              aria-label="How the film is priced"
              value={film.mode}
              onChange={(e) => setFilm({ mode: e.target.value })}
            >
              <option value="per_kg">Per kilo</option>
              <option value="per_sqm">Per square metre</option>
            </select>
            <span className="text-[11px] text-slate-500">as the supplier bills it</span>
          </label>
          {film.mode === "per_kg" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Rate (₹/kg)</span>
              <NumberCell
                value={film.ratePerKg}
                onChange={(v) => setFilm({ ratePerKg: v })}
                aria-label="Film rate per kilo"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Rate (₹/m²)</span>
              <NumberCell
                value={film.ratePerSqm}
                onChange={(v) => setFilm({ ratePerSqm: v })}
                aria-label="Film rate per square metre"
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Thickness (micron)</span>
            <NumberCell
              value={film.micron}
              onChange={(v) => setFilm({ micron: v })}
              aria-label="Film thickness in micron"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Density (g/cm³)</span>
            <NumberCell
              value={film.density}
              onChange={(v) => setFilm({ density: v, material: "" })}
              aria-label="Film density"
            />
          </label>
        </div>

        <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
          {film.micron} micron at {film.density} g/cm³ is <strong>{weight.toFixed(1)} gsm</strong> — one kilo yields{" "}
          {yieldPerKg.toFixed(2)} m², so this film costs <strong>{formatPaise(perSqm)} per m²</strong>.{" "}
          {film.mode === "per_kg"
            ? "Priced per kilo, thicker film costs more per metre run."
            : "Priced per square metre, thickness changes the weight but not the rate."}
        </p>
      </div>
    </Panel>
  );
}

/** Fields the rates panel edits, kept next to it so the page can seed them. */
export const DEFAULT_COSTING = () => ({
  enabled: true,
  colours: 4,
  sets: 1,
  plateRatePerCm2: 1.3,
  film: { mode: "per_kg", ratePerKg: 220, ratePerSqm: 0, micron: 50, density: FILM_DENSITY.PVC, material: "PVC" },
});
