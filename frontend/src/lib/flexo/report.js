/**
 * The printable gang report: a job summary, then one section per plate with
 * its layout drawn to scale and its per-SKU figures.
 */

import { createPdf, downloadPdf, textWidth } from "@/lib/pdf/minipdf";
import { formatArea, formatDistance, formatLength, formatPercent, getUnit } from "@/lib/cutlist/units";

const INK = "#0f172a";
const MUTED = "#5b6675";
const LINE = "#cbd5e1";
const ACCENT = "#ea580c";
const WASTE = "#dc2626";
const WEB_FILL = "#f1f5f9";
const TRIM_FILL = "#fde2e2";

const SWATCHES = [
  "#bfdbfe", "#fed7aa", "#bbf7d0", "#fecaca", "#ddd6fe", "#fde68a",
  "#a5f3fc", "#f5d0fe", "#d9f99d", "#fbcfe8", "#c7d2fe", "#99f6e4",
  "#fef08a", "#e9d5ff", "#bae6fd", "#fecdd3",
];

const MARGIN = 40;

const area = (value, unit) => formatArea(value, unit).replace(/(\.\d\d)\d+/, "$1");

/** Draw one plate's repeat to scale inside the given box. */
function drawLayout(doc, plate, box, unit, margin, gutter, colorOf) {
  const plan = plate.plan;
  const scale = Math.min(box.w / plan.webWidth, box.h / plan.repeat);
  const w = plan.webWidth * scale;
  const h = plan.repeat * scale;
  const x0 = box.x + (box.w - w) / 2;
  const y0 = box.y;

  doc.rect(x0, y0, w, h, { fill: WEB_FILL, stroke: LINE, lineWidth: 0.8 });
  if (margin > 0) {
    doc.rect(x0, y0, margin * scale, h, { fill: TRIM_FILL });
    doc.rect(x0 + w - margin * scale, y0, margin * scale, h, { fill: TRIM_FILL });
  }

  const usable = plan.webWidth - 2 * margin;
  let x = margin + Math.max(0, (usable - plan.usedWidth) / 2);
  plan.lanes.forEach((lane) => {
    for (let l = 0; l < lane.lanes; l++) {
      const pitchY = lane.height + lane.gapAround;
      for (let r = 0; r < lane.around; r++) {
        const ry = lane.gapAround / 2 + r * pitchY;
        doc.rect(x0 + x * scale, y0 + ry * scale, lane.width * scale, lane.height * scale, {
          fill: colorOf(lane.id),
          stroke: INK,
          lineWidth: 0.4,
        });
      }
      x += lane.width + gutter;
    }
  });

  doc.line(x0, y0, x0 + w, y0, { color: WASTE, width: 1, dash: "3 2" });
  doc.line(x0, y0 + h, x0 + w, y0 + h, { color: WASTE, width: 1, dash: "3 2" });
  doc.text(x0 + w / 2, y0 - 6, `web ${formatLength(plan.webWidth, unit)} ${unit}`, {
    size: 8,
    color: MUTED,
    align: "center",
  });
  doc.text(x0 + w + 6, y0 + h / 2, `repeat ${formatLength(plan.repeat, unit)}`, { size: 8, color: WASTE });

  return h;
}

/** A simple table with fixed column positions. */
function drawTable(doc, x, y, columns, rows, { headSize = 8, rowSize = 8.5, rowHeight = 14 } = {}) {
  let cursor = y;
  columns.forEach((col) => {
    doc.text(x + col.x, cursor, col.title, {
      size: headSize,
      bold: true,
      color: MUTED,
      align: col.align || "left",
    });
  });
  cursor += 4;
  doc.line(x, cursor, x + columns[columns.length - 1].x, cursor, { color: LINE, width: 0.5 });
  cursor += rowHeight - 4;

  rows.forEach((row) => {
    columns.forEach((col) => {
      const value = row[col.key];
      if (value === undefined || value === null) return;
      doc.text(x + col.x, cursor, value, {
        size: rowSize,
        color: row.tone || INK,
        align: col.align || "left",
        bold: !!row.bold,
      });
    });
    if (row.swatch) doc.rect(x - 12, cursor - 6, 7, 7, { fill: row.swatch, stroke: LINE, lineWidth: 0.4 });
    cursor += rowHeight;
  });

  return cursor;
}

/**
 * Build the whole report. `result` is a solvePlateSets result.
 */
export function buildGangReport({ result, press, unit, skus, projectName = "Gang run" }) {
  const doc = createPdf({ size: "a4", title: `${projectName} — flexo gang report` });
  const u = getUnit(unit);
  const margin = parseFloat(press.edgeMargin) || 0;
  const gutter = parseFloat(press.gapAcross) || 0;

  const colorIndex = new Map();
  skus.forEach((s, i) => colorIndex.set(s.id, i));
  const colorOf = (id) => SWATCHES[(colorIndex.get(id) ?? 0) % SWATCHES.length];

  const right = doc.width - MARGIN;
  const stamp = new Date();
  const dateText = `${String(stamp.getDate()).padStart(2, "0")}/${String(stamp.getMonth() + 1).padStart(2, "0")}/${stamp.getFullYear()}`;

  let y = MARGIN;
  doc.text(MARGIN, y + 4, "Flexo gang run report", { size: 17, bold: true });
  doc.text(right, y + 4, dateText, { size: 9, color: MUTED, align: "right" });
  y += 18;
  doc.text(MARGIN, y, projectName, { size: 10, color: MUTED });
  y += 14;
  doc.line(MARGIN, y, right, y, { color: LINE, width: 0.8 });
  y += 20;

  /* ---- job summary ------------------------------------------------ */
  const t = result.totals;
  doc.text(MARGIN, y, "Job summary", { size: 11, bold: true });
  y += 16;

  const summary = [
    ["Plates needed", String(t.plates)],
    ["SKUs in the job", String(t.skus)],
    ["Labels ordered", t.ordered.toLocaleString()],
    ["Labels printed", t.printed.toLocaleString()],
    ["Overrun", `${t.overrun.toLocaleString()} (${formatPercent(t.overrunPct, 1)})`],
    ["Web to run", formatDistance(t.webLength, unit)],
    ["Material", area(t.materialArea, unit)],
    ["Press turns", t.revolutions.toLocaleString()],
  ];
  // The base-14 fonts here have no rupee glyph, so money is written as Rs.
  if (result.rankedBy === "cost") {
    const rs = (v) => `Rs ${Math.round(v).toLocaleString("en-IN")}`;
    summary.push(
      ["Plates", rs(t.plateCost)],
      ["Film", rs(t.materialCost)],
      ["Job total", rs(t.totalCost)],
      ["Per 1000", rs(t.costPerThousand)]
    );
  }
  const colW = (right - MARGIN) / 4;
  summary.forEach(([label, value], i) => {
    const cx = MARGIN + (i % 4) * colW;
    const cy = y + Math.floor(i / 4) * 30;
    doc.text(cx, cy, label.toUpperCase(), { size: 7, color: MUTED });
    doc.text(cx, cy + 12, value, { size: 11, bold: true });
  });
  y += 30 * Math.ceil(summary.length / 4) + 6;

  doc.line(MARGIN, y, right, y, { color: LINE, width: 0.5 });
  y += 16;

  /* ---- press setup ------------------------------------------------ */
  doc.text(MARGIN, y, "Press setup", { size: 11, bold: true });
  y += 14;
  const widthRule =
    (press.webMode || "range") === "range"
      ? `slit to fit, ${formatLength(press.minWidth, unit)}–${formatLength(press.maxWidth, unit)} ${u.label}`
      : "stocked widths only";
  const setup = [
    `Print width: ${widthRule}`,
    `Cylinders: ${press.cylinderMode === "list" ? press.teethList : `${press.minTeeth}–${press.maxTeeth} teeth`}`,
    `Gutter across ${formatLength(gutter, unit)} ${u.label} · gap around ${formatLength(press.gapAround, unit)} ${u.label} · edge margin ${formatLength(margin, unit)} ${u.label}`,
    `Grouping: ${result.strategy}`,
  ];
  setup.forEach((linetext) => {
    doc.text(MARGIN, y, linetext, { size: 9, color: MUTED });
    y += 12;
  });

  /* ---- plates at a glance ----------------------------------------- */
  y += 10;
  doc.line(MARGIN, y, right, y, { color: LINE, width: 0.5 });
  y += 16;
  doc.text(MARGIN, y, "Plates at a glance", { size: 11, bold: true });
  y += 16;

  const glanceColumns = [
    { key: "plate", title: "PLATE", x: 0 },
    { key: "skus", title: "SKUS", x: 32 },
    { key: "slit", title: "SLIT TO", x: 250, align: "right" },
    { key: "teeth", title: "CYL", x: 296, align: "right" },
    { key: "lanes", title: "LANES", x: 338, align: "right" },
    { key: "turns", title: "TURNS", x: 392, align: "right" },
    { key: "used", title: "USED", x: 432, align: "right" },
    { key: "over", title: "OVERRUN", x: 515, align: "right" },
  ];
  const glanceRows = result.plates.map((plate) => {
    const plan = plate.plan;
    const names = plan.lanes.map((l) => l.name).join(", ");
    const ordered = plan.lanes.reduce((s, l) => s + l.ordered, 0);
    return {
      plate: String(plate.index),
      skus: names.length > 42 ? `${names.slice(0, 40)}...` : names,
      slit: `${formatLength(plan.webWidth, unit)} ${u.label}`,
      teeth: `${plan.teeth}T`,
      lanes: String(plan.totalLanes),
      turns: plan.revolutions.toLocaleString(),
      used: formatPercent(plan.utilisation),
      over: `${plan.totalOverrun.toLocaleString()} (${formatPercent(ordered > 0 ? plan.totalOverrun / ordered : 0, 1)})`,
    };
  });
  y = drawTable(doc, MARGIN, y, glanceColumns, glanceRows);

  /* ---- one section per plate -------------------------------------- */
  result.plates.forEach((plate) => {
    doc.addPage();
    let py = MARGIN;
    const plan = plate.plan;

    doc.text(MARGIN, py + 2, `Plate ${plate.index} of ${result.plates.length}`, { size: 14, bold: true });
    doc.text(right, py + 2, `${plan.teeth}T · ${formatLength(plan.repeat, unit)} ${u.label} repeat`, {
      size: 9,
      color: MUTED,
      align: "right",
    });
    py += 16;
    doc.line(MARGIN, py, right, py, { color: LINE, width: 0.8 });
    py += 18;

    const facts = [
      ["Slit to", `${formatLength(plan.webWidth, unit)} ${u.label}`],
      ["Lanes", String(plan.totalLanes)],
      ["Turns", plan.revolutions.toLocaleString()],
      ["Web", formatDistance(plan.webLength, unit)],
      ["Material used", formatPercent(plan.utilisation)],
      ["Trim", `${formatLength(plan.edgeWaste, unit)} ${u.label}`],
    ];
    const fw = (right - MARGIN) / facts.length;
    facts.forEach(([label, value], i) => {
      doc.text(MARGIN + i * fw, py, label.toUpperCase(), { size: 7, color: MUTED });
      doc.text(MARGIN + i * fw, py + 12, value, { size: 10, bold: true });
    });
    py += 34;

    const drawn = drawLayout(
      doc,
      plate,
      { x: MARGIN, y: py + 10, w: right - MARGIN, h: 300 },
      unit,
      margin,
      gutter,
      colorOf
    );
    py += drawn + 30;

    doc.text(MARGIN, py, "Labels on this plate", { size: 11, bold: true });
    py += 16;

    const columns = [
      { key: "name", title: "SKU", x: 0 },
      { key: "size", title: "SIZE", x: 138 },
      { key: "lanes", title: "LANES", x: 225, align: "right" },
      { key: "around", title: "AROUND", x: 268, align: "right" },
      { key: "perRev", title: "PER TURN", x: 320, align: "right" },
      { key: "ordered", title: "ORDERED", x: 375, align: "right" },
      { key: "printed", title: "PRINTED", x: 432, align: "right" },
      { key: "over", title: "OVERRUN", x: 501, align: "right" },
    ];
    const rows = plan.lanes.map((lane) => ({
      swatch: colorOf(lane.id),
      name: lane.name + (lane.rotated ? " (turned)" : ""),
      size: `${formatLength(lane.width, unit)} x ${formatLength(lane.height, unit)}`,
      lanes: String(lane.lanes),
      around: String(lane.around),
      perRev: String(lane.perRev),
      ordered: lane.ordered.toLocaleString(),
      printed: lane.printed.toLocaleString(),
      over: `${lane.overrun.toLocaleString()} (${formatPercent(lane.overrunPct, 1)})`,
      tone: lane.overrunPct > 0.15 ? WASTE : INK,
    }));
    py = drawTable(doc, MARGIN + 14, py, columns, rows);

    py += 6;
    doc.text(MARGIN, py, `Cut and mount to a ${formatLength(plan.repeat, unit)} ${u.label} repeat.`, {
      size: 9,
      color: MUTED,
    });
  });

  /* ---- footer on the last page ------------------------------------ */
  doc.text(MARGIN, doc.height - 24, "Generated by the Flexo Label Optimizer", { size: 8, color: MUTED });

  return doc;
}

export function exportGangReport(args) {
  const doc = buildGangReport(args);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadPdf(doc, `flexo-gang-report-${stamp}.pdf`);
  return doc;
}

export { textWidth };
