/** Project state: defaults, sample data, CSV import/export, persistence. */

import { DEFAULT_SETTINGS } from "./optimizer";
import { convert } from "./units";

export const STORAGE_KEY = "cutlist.project.v1";

let seq = 0;
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const emptyPart = (overrides = {}) => ({
  id: newId("part"),
  enabled: true,
  length: "",
  width: "",
  qty: 1,
  label: "",
  material: "",
  canRotate: true,
  ...overrides,
});

export const emptyStock = (overrides = {}) => ({
  id: newId("stock"),
  enabled: true,
  length: "",
  width: "",
  qty: 0,
  label: "",
  material: "",
  ...overrides,
});

export const DEFAULT_PROJECT = () => ({
  name: "Untitled project",
  unit: "mm",
  settings: {
    ...DEFAULT_SETTINGS,
    kerf: 3,
    trim: 0,
    considerGrain: false,
    objective: "sheets",
    effort: "balanced",
  },
  parts: [
    emptyPart({ length: 600, width: 400, qty: 4, label: "Side" }),
    emptyPart({ length: 900, width: 300, qty: 2, label: "Shelf" }),
    emptyPart({ length: 1200, width: 500, qty: 2, label: "Top" }),
    emptyPart(),
  ],
  stock: [emptyStock({ length: 2440, width: 1220, qty: 0, label: "Standard board" })],
});

export const SAMPLE_PROJECT = () => ({
  name: "Kitchen carcass",
  unit: "mm",
  settings: { ...DEFAULT_SETTINGS, kerf: 3.2, trim: 0, considerGrain: false, objective: "sheets", effort: "thorough" },
  parts: [
    emptyPart({ length: 720, width: 580, qty: 8, label: "Carcass side" }),
    emptyPart({ length: 764, width: 580, qty: 8, label: "Top / bottom" }),
    emptyPart({ length: 764, width: 560, qty: 6, label: "Shelf" }),
    emptyPart({ length: 715, width: 396, qty: 8, label: "Door", canRotate: false }),
    emptyPart({ length: 764, width: 100, qty: 4, label: "Rail" }),
    emptyPart({ length: 500, width: 480, qty: 6, label: "Drawer side" }),
  ],
  stock: [emptyStock({ length: 2440, width: 1220, qty: 0, label: "18mm MDF" })],
});

/* ------------------------------------------------------------------ */
/* unit switching                                                      */
/* ------------------------------------------------------------------ */

const convField = (v, from, to) => (v === "" || v === null || v === undefined ? v : convert(v, from, to));

export function convertProject(project, toUnit) {
  const from = project.unit;
  if (from === toUnit) return project;
  return {
    ...project,
    unit: toUnit,
    settings: {
      ...project.settings,
      kerf: convField(project.settings.kerf, from, toUnit),
      trim: convField(project.settings.trim, from, toUnit),
    },
    parts: project.parts.map((p) => ({
      ...p,
      length: convField(p.length, from, toUnit),
      width: convField(p.width, from, toUnit),
    })),
    stock: project.stock.map((s) => ({
      ...s,
      length: convField(s.length, from, toUnit),
      width: convField(s.width, from, toUnit),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* persistence                                                         */
/* ------------------------------------------------------------------ */

export function saveProject(project) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    /* storage unavailable — the session simply is not restored */
  }
}

export function loadProject() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.parts) || !Array.isArray(parsed.stock)) return null;
    return {
      ...DEFAULT_PROJECT(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* CSV / clipboard import                                              */
/* ------------------------------------------------------------------ */

const splitLine = (line) => {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  return line.split(",");
};

const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const HEADER_WORDS = ["length", "width", "qty", "quantity", "label", "name", "material", "height", "amount"];

/**
 * Parse pasted spreadsheet or CSV rows into part/stock rows.
 * Accepted columns: length, width, qty, label, material, grain.
 * A header row is detected and used to map columns when present.
 */
export function parseRows(text, kind = "part") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], skipped: 0 };

  let map = { length: 0, width: 1, qty: 2, label: 3, material: 4, grain: 5 };
  let start = 0;

  const firstCells = splitLine(lines[0]).map((c) => c.trim().toLowerCase());
  const looksLikeHeader = firstCells.some((c) => HEADER_WORDS.includes(c));
  if (looksLikeHeader) {
    start = 1;
    const find = (...names) => firstCells.findIndex((c) => names.includes(c));
    map = {
      length: find("length", "len", "l"),
      width: find("width", "w", "height"),
      qty: find("qty", "quantity", "count", "amount", "pcs"),
      label: find("label", "name", "part", "description"),
      material: find("material", "mat"),
      grain: find("grain", "rotate", "rotatable", "fixed"),
    };
  }

  const rows = [];
  let skipped = 0;
  for (let i = start; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map((c) => c.trim().replace(/^"|"$/g, ""));
    const length = toNum(cells[map.length]);
    const width = toNum(cells[map.width]);
    if (length === null || width === null || length <= 0 || width <= 0) {
      skipped++;
      continue;
    }
    const qtyRaw = map.qty >= 0 ? toNum(cells[map.qty]) : null;
    const label = map.label >= 0 ? cells[map.label] || "" : "";
    const material = map.material >= 0 ? cells[map.material] || "" : "";
    const grainCell = map.grain >= 0 ? (cells[map.grain] || "").toLowerCase() : "";
    const base = { length, width, label, material };
    if (kind === "stock") {
      rows.push(emptyStock({ ...base, qty: qtyRaw === null ? 0 : Math.max(0, Math.floor(qtyRaw)) }));
    } else {
      rows.push(
        emptyPart({
          ...base,
          qty: qtyRaw === null || qtyRaw <= 0 ? 1 : Math.floor(qtyRaw),
          canRotate: !["no", "false", "fixed", "0", "grain"].includes(grainCell),
        })
      );
    }
  }
  return { rows, skipped };
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function partsToCsv(parts) {
  const head = ["length", "width", "qty", "label", "material", "grain"];
  const body = parts
    .filter((p) => p.length !== "" && p.width !== "")
    .map((p) => [p.length, p.width, p.qty, p.label, p.material, p.canRotate ? "free" : "fixed"].map(csvCell).join(","));
  return [head.join(","), ...body].join("\n");
}

export function stockToCsv(stock) {
  const head = ["length", "width", "qty", "label", "material"];
  const body = stock
    .filter((s) => s.length !== "" && s.width !== "")
    .map((s) => [s.length, s.width, s.qty, s.label, s.material].map(csvCell).join(","));
  return [head.join(","), ...body].join("\n");
}

/** CSV of the solved layout: one line per placed part. */
export function resultToCsv(result, unit) {
  const head = ["sheet", "sheet_label", "part", "length", "width", "x", "y", "rotated", "material", "unit"];
  const rows = [];
  result.sheets.forEach((sheet) => {
    sheet.placements.forEach((p) => {
      rows.push(
        [
          sheet.index,
          sheet.label,
          p.label,
          p.w,
          p.h,
          p.x,
          p.y,
          p.rotated ? "yes" : "no",
          p.material || "",
          unit,
        ]
          .map(csvCell)
          .join(",")
      );
    });
  });
  return [head.join(","), ...rows].join("\n");
}

export function download(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
