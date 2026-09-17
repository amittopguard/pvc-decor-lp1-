/**
 * Packing quality benchmark for the cut list optimizer.
 *
 * Runs a set of representative jobs at every effort level and prints the sheet
 * count against the theoretical lower bound (total part area / sheet area).
 * The lower bound ignores kerf and the guillotine constraint, so matching it is
 * often impossible — this is a regression yardstick, not a pass/fail gate.
 *
 *   node tests/cutlist_benchmark.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "frontend", "src", "lib", "cutlist", "optimizer.js");

function loadOptimizer() {
  const code = fs.readFileSync(SRC, "utf8").replace(/^export /gm, "");
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(`${code}\nmodule.exports = { optimize };`, sandbox, { filename: "optimizer.js" });
  return sandbox.module.exports;
}
const { optimize } = loadOptimizer();

const SHEET = { id: "s", label: "2440x1220", length: 2440, width: 1220, qty: 0 };

const CASES = {
  "kitchen carcass": {
    parts: [
      { id: "a", label: "Carcass side", length: 720, width: 580, qty: 8 },
      { id: "b", label: "Top / bottom", length: 764, width: 580, qty: 8 },
      { id: "c", label: "Shelf", length: 764, width: 560, qty: 6 },
      { id: "d", label: "Door", length: 715, width: 396, qty: 8, canRotate: false },
      { id: "e", label: "Rail", length: 764, width: 100, qty: 4 },
      { id: "f", label: "Drawer side", length: 500, width: 480, qty: 6 },
    ],
    stock: [SHEET],
  },
  wardrobe: {
    parts: [
      { id: "a", length: 1800, width: 600, qty: 4 },
      { id: "b", length: 1200, width: 600, qty: 6 },
      { id: "c", length: 600, width: 400, qty: 12 },
      { id: "d", length: 380, width: 380, qty: 20 },
    ],
    stock: [SHEET],
  },
  "many small parts": {
    parts: Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      length: 150 + i * 40,
      width: 120 + ((i * 71) % 300),
      qty: 10,
    })),
    stock: [SHEET],
  },
  "long strips": {
    parts: [
      { id: "a", length: 2400, width: 80, qty: 20 },
      { id: "b", length: 1200, width: 300, qty: 8 },
    ],
    stock: [SHEET],
  },
};

for (const [name, data] of Object.entries(CASES)) {
  const partArea = data.parts.reduce((s, p) => s + p.length * p.width * p.qty, 0);
  const bound = Math.ceil(partArea / (data.stock[0].length * data.stock[0].width));
  const runs = ["fast", "balanced", "thorough"].map((effort) => {
    const t = Date.now();
    const r = optimize({
      parts: data.parts,
      stock: data.stock,
      settings: { kerf: 3, trim: 0, effort, timeBudgetMs: 10000 },
    });
    const unplaced = r.unplaced.reduce((s, u) => s + u.qty, 0);
    return (
      `${effort}: ${r.summary.sheetCount} sheets ${(r.summary.utilisation * 100).toFixed(1)}%` +
      `${unplaced ? ` (${unplaced} UNPLACED)` : ""} ${Date.now() - t}ms`
    );
  });
  console.log(`${name.padEnd(18)} bound ${bound} | ${runs.join(" | ")}`);
}
