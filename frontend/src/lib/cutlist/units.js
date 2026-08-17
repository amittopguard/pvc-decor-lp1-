/** Units, conversion and display formatting for the cut list optimizer. */

export const UNITS = [
  { id: "mm", label: "mm", name: "Millimetres", toMm: 1, decimals: 1 },
  { id: "cm", label: "cm", name: "Centimetres", toMm: 10, decimals: 2 },
  { id: "m", label: "m", name: "Metres", toMm: 1000, decimals: 3 },
  { id: "in", label: "in", name: "Inches", toMm: 25.4, decimals: 3 },
  { id: "ft", label: "ft", name: "Feet", toMm: 304.8, decimals: 3 },
];

export const getUnit = (id) => UNITS.find((u) => u.id === id) || UNITS[0];

/** Convert a single value between units. */
export function convert(value, from, to) {
  const v = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(v)) return value;
  if (from === to) return v;
  const mm = v * getUnit(from).toMm;
  const out = mm / getUnit(to).toMm;
  return Math.round(out * 1e4) / 1e4;
}

/** Trim trailing zeros so 600.000 reads as 600. */
export function trimNumber(v, decimals = 3) {
  if (!Number.isFinite(v)) return "";
  const s = v.toFixed(decimals);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function formatLength(value, unitId, withUnit = false) {
  const unit = getUnit(unitId);
  const s = trimNumber(Number(value) || 0, unit.decimals);
  return withUnit ? `${s} ${unit.label}` : s;
}

/**
 * Areas are entered in the working unit squared but read best in m² or ft².
 */
export function formatArea(area, unitId) {
  const a = Number(area) || 0;
  switch (unitId) {
    case "mm":
      return `${(a / 1e6).toFixed(3)} m²`;
    case "cm":
      return `${(a / 1e4).toFixed(3)} m²`;
    case "m":
      return `${a.toFixed(3)} m²`;
    case "in":
      return `${(a / 144).toFixed(2)} ft²`;
    case "ft":
      return `${a.toFixed(2)} ft²`;
    default:
      return a.toFixed(2);
  }
}

export const formatPercent = (v, digits = 1) => `${((Number(v) || 0) * 100).toFixed(digits)}%`;

/**
 * Long runs such as total cut length read better in a bigger unit —
 * 50.05 m rather than 50045 mm.
 */
export function formatDistance(value, unitId) {
  const v = Number(value) || 0;
  if (unitId === "mm" && v >= 1000) return `${(v / 1000).toFixed(2)} m`;
  if (unitId === "cm" && v >= 100) return `${(v / 100).toFixed(2)} m`;
  if (unitId === "in" && v >= 12) return `${(v / 12).toFixed(2)} ft`;
  return `${trimNumber(v, getUnit(unitId).decimals)} ${getUnit(unitId).label}`;
}
