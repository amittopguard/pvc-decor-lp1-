/**
 * Verification harness for the cut list optimizer.
 *
 * The optimizer ships as an ES module for the React build, so it is loaded
 * here by stripping the `export` keywords and evaluating it as CommonJS.
 * Run with: node tests/cutlist_optimizer.test.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "frontend", "src", "lib", "cutlist", "optimizer.js");

function loadOptimizer() {
  const code = fs.readFileSync(SRC, "utf8").replace(/^export /gm, "");
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(
    `${code}\nmodule.exports = { optimize, validate, round, DEFAULT_SETTINGS };`,
    sandbox,
    { filename: "optimizer.js" }
  );
  return sandbox.module.exports;
}

const { optimize, validate } = loadOptimizer();

let failures = 0;
let checks = 0;
function check(name, condition, detail) {
  checks++;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`\n${name}`);
}

const EPS = 1e-6;

/** Structural checks that must hold for any result. */
function assertSound(result, settings, label) {
  const kerf = settings.kerf ?? 0;
  const trim = settings.trim ?? 0;

  let overlaps = 0;
  let outOfBounds = 0;
  let kerfViolations = 0;

  for (const sheet of result.sheets) {
    for (const p of sheet.placements) {
      if (
        p.x < trim - EPS ||
        p.y < trim - EPS ||
        p.x + p.w > sheet.length - trim + EPS ||
        p.y + p.h > sheet.width - trim + EPS
      ) {
        outOfBounds++;
      }
    }
    for (let i = 0; i < sheet.placements.length; i++) {
      for (let j = i + 1; j < sheet.placements.length; j++) {
        const a = sheet.placements[i];
        const b = sheet.placements[j];
        const gapX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
        const gapY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
        const gap = Math.max(gapX, gapY);
        if (gap < -EPS) overlaps++;
        else if (gap < kerf - 1e-4) kerfViolations++;
      }
    }
  }

  check(`${label}: no overlapping parts`, overlaps === 0, `${overlaps} overlapping pairs`);
  check(`${label}: every part inside the sheet`, outOfBounds === 0, `${outOfBounds} outside`);
  check(`${label}: saw kerf kept between parts`, kerfViolations === 0, `${kerfViolations} pairs closer than ${kerf}`);

  const areaSum = result.sheets.reduce(
    (s, sh) => s + sh.placements.reduce((t, p) => t + p.w * p.h, 0),
    0
  );
  check(
    `${label}: reported used area matches placements`,
    Math.abs(areaSum - result.summary.usedArea) < 1e-3,
    `${areaSum} vs ${result.summary.usedArea}`
  );
}

/* ------------------------------------------------------------------ */

section("1. Exact fit — four 600x400 parts on a 1200x800 sheet, no kerf");
{
  const settings = { kerf: 0, trim: 0, considerGrain: false, effort: "balanced" };
  const result = optimize({
    parts: [{ id: "p1", label: "A", length: 600, width: 400, qty: 4 }],
    stock: [{ id: "s1", label: "Board", length: 1200, width: 800, qty: 0 }],
    settings,
  });
  check("uses exactly one sheet", result.summary.sheetCount === 1, `got ${result.summary.sheetCount}`);
  check("places all 4 parts", result.summary.placedCount === 4, `got ${result.summary.placedCount}`);
  check(
    "utilisation is 100%",
    Math.abs(result.summary.utilisation - 1) < 1e-9,
    `${(result.summary.utilisation * 100).toFixed(2)}%`
  );
  check("no leftover parts", result.unplaced.length === 0);
  assertSound(result, settings, "exact fit");
}

section("2. Kerf is consumed — same parts with a 10mm blade need a second sheet");
{
  const settings = { kerf: 10, trim: 0, effort: "balanced" };
  const result = optimize({
    parts: [{ id: "p1", label: "A", length: 600, width: 400, qty: 4 }],
    stock: [{ id: "s1", label: "Board", length: 1200, width: 800, qty: 0 }],
    settings,
  });
  check("all parts still placed", result.summary.placedCount === 4, `got ${result.summary.placedCount}`);
  check("needs more than one sheet", result.summary.sheetCount === 2, `got ${result.summary.sheetCount}`);
  assertSound(result, settings, "kerf");
}

section("3. Grain direction — parts may not be rotated when grain is fixed");
{
  const settings = { kerf: 0, trim: 0, considerGrain: true, effort: "balanced" };
  const parts = [{ id: "p1", label: "Door", length: 800, width: 300, qty: 3, canRotate: false }];
  const stock = [{ id: "s1", label: "Board", length: 900, width: 900, qty: 0 }];
  const result = optimize({ parts, stock, settings });
  const rotated = result.sheets.flatMap((s) => s.placements).filter((p) => p.rotated);
  check("nothing was rotated", rotated.length === 0, `${rotated.length} rotated`);
  check("all 3 placed", result.summary.placedCount === 3);
  assertSound(result, settings, "grain");

  const free = optimize({
    parts: [{ id: "p1", label: "Door", length: 800, width: 300, qty: 3, canRotate: true }],
    stock,
    settings: { ...settings, considerGrain: false },
  });
  check(
    "rotation allowed produces no more sheets than fixed grain",
    free.summary.sheetCount <= result.summary.sheetCount,
    `${free.summary.sheetCount} vs ${result.summary.sheetCount}`
  );
}

section("4. Mixed part sizes across a limited stock pool");
{
  const settings = { kerf: 3, trim: 0, effort: "thorough" };
  const parts = [
    { id: "p1", label: "Side", length: 720, width: 580, qty: 8 },
    { id: "p2", label: "Shelf", length: 900, width: 300, qty: 6 },
    { id: "p3", label: "Back", length: 1200, width: 400, qty: 4 },
    { id: "p4", label: "Rail", length: 450, width: 100, qty: 12 },
  ];
  const stock = [{ id: "s1", label: "2440x1220", length: 2440, width: 1220, qty: 10 }];
  const result = optimize({ parts, stock, settings });
  const totalQty = parts.reduce((s, p) => s + p.qty, 0);
  check(`places all ${totalQty} parts`, result.summary.placedCount === totalQty, `got ${result.summary.placedCount}`);
  check("stays within the 10 available sheets", result.summary.sheetCount <= 10, `used ${result.summary.sheetCount}`);
  check(
    "utilisation above 75%",
    result.summary.utilisation > 0.75,
    `${(result.summary.utilisation * 100).toFixed(1)}%`
  );
  assertSound(result, settings, "mixed");

  const counts = {};
  result.sheets.forEach((sh) => sh.placements.forEach((p) => (counts[p.rowId] = (counts[p.rowId] || 0) + 1)));
  const perRowOk = parts.every((p) => counts[p.id] === p.qty);
  check("每 quantity honoured exactly".replace("每", "per-row"), perRowOk, JSON.stringify(counts));
}

section("5. Limited stock quantity leaves the surplus unplaced");
{
  const settings = { kerf: 3, trim: 0, effort: "balanced" };
  const result = optimize({
    parts: [{ id: "p1", label: "A", length: 1200, width: 600, qty: 20 }],
    stock: [{ id: "s1", label: "Board", length: 1220, width: 610, qty: 3 }],
    settings,
  });
  check("uses only the 3 available sheets", result.summary.sheetCount === 3, `got ${result.summary.sheetCount}`);
  check("places 3 parts", result.summary.placedCount === 3, `got ${result.summary.placedCount}`);
  check("reports 17 unplaced", result.unplaced.reduce((s, u) => s + u.qty, 0) === 17);
  assertSound(result, settings, "limited stock");
}

section("6. Oversized part is reported, not silently dropped");
{
  const settings = { kerf: 0, trim: 0, effort: "fast" };
  const result = optimize({
    parts: [
      { id: "p1", label: "Huge", length: 5000, width: 5000, qty: 1 },
      { id: "p2", label: "Fine", length: 400, width: 400, qty: 2 },
    ],
    stock: [{ id: "s1", label: "Board", length: 1000, width: 1000, qty: 0 }],
    settings,
  });
  check("the oversized part is listed as unplaced", result.unplaced.some((u) => u.label === "Huge"));
  check("the fitting parts are still placed", result.summary.placedCount === 2, `got ${result.summary.placedCount}`);
  check("run does not hang or error", result.ok === true);
}

section("7. Edge trim reduces the usable area");
{
  const settings = { kerf: 0, trim: 10, effort: "balanced" };
  const result = optimize({
    parts: [{ id: "p1", label: "A", length: 600, width: 400, qty: 4 }],
    stock: [{ id: "s1", label: "Board", length: 1200, width: 800, qty: 0 }],
    settings,
  });
  check("trimmed sheet can no longer hold all 4", result.summary.sheetCount === 2, `got ${result.summary.sheetCount}`);
  assertSound(result, settings, "trim");
}

section("8. Materials are never mixed on one sheet");
{
  const settings = { kerf: 3, trim: 0, effort: "balanced" };
  const result = optimize({
    parts: [
      { id: "p1", label: "Oak part", length: 600, width: 400, qty: 4, material: "Oak" },
      { id: "p2", label: "Ash part", length: 600, width: 400, qty: 4, material: "Ash" },
    ],
    stock: [
      { id: "s1", label: "Oak board", length: 1220, width: 2440, qty: 5, material: "Oak" },
      { id: "s2", label: "Ash board", length: 1220, width: 2440, qty: 5, material: "Ash" },
    ],
    settings,
  });
  const mixed = result.sheets.filter((sh) => sh.placements.some((p) => p.material !== sh.material));
  check("no sheet carries a foreign material", mixed.length === 0, `${mixed.length} mixed sheets`);
  check("all 8 parts placed", result.summary.placedCount === 8, `got ${result.summary.placedCount}`);
  assertSound(result, settings, "materials");
}

section("9. Multiple stock sizes are chosen sensibly");
{
  const settings = { kerf: 3, trim: 0, effort: "thorough" };
  const result = optimize({
    parts: [{ id: "p1", label: "A", length: 600, width: 400, qty: 6 }],
    stock: [
      { id: "s1", label: "Small", length: 610, width: 810, qty: 10 },
      { id: "s2", label: "Large", length: 2440, width: 1220, qty: 10 },
    ],
    settings,
  });
  check("all 6 placed", result.summary.placedCount === 6, `got ${result.summary.placedCount}`);
  check("total stock area is not wasteful", result.summary.utilisation > 0.5, `${(result.summary.utilisation * 100).toFixed(1)}%`);
  assertSound(result, settings, "multi stock");
}

section("10. Cut list integrity");
{
  const settings = { kerf: 4, trim: 0, effort: "balanced" };
  const result = optimize({
    parts: [
      { id: "p1", label: "A", length: 500, width: 300, qty: 5 },
      { id: "p2", label: "B", length: 250, width: 250, qty: 5 },
    ],
    stock: [{ id: "s1", label: "Board", length: 2000, width: 1000, qty: 0 }],
    settings,
  });
  const sheet = result.sheets[0];
  const badCuts = sheet.cuts.filter(
    (c) =>
      c.length <= 0 ||
      (c.dir === "v" && (c.pos < 0 || c.pos > sheet.length + EPS)) ||
      (c.dir === "h" && (c.pos < 0 || c.pos > sheet.width + EPS))
  );
  check("every cut is inside the sheet and has a positive length", badCuts.length === 0, `${badCuts.length} bad cuts`);
  check("cut count is reported", result.summary.cuts === result.sheets.reduce((s, sh) => s + sh.cutCount, 0));
  check("total cut length is positive", result.summary.cutLength > 0);
  assertSound(result, settings, "cut list");
}

section("11. Validation and empty input");
{
  check("empty parts list is rejected", validate({ parts: [], stock: [{ length: 10, width: 10 }] }).length === 1);
  check("empty stock list is rejected", validate({ parts: [{ length: 1, width: 1, qty: 1 }], stock: [] }).length === 1);
  const empty = optimize({ parts: [], stock: [], settings: {} });
  check("optimize on empty input returns a clean error", empty.ok === false && !!empty.error);
}

section("12. Disabled rows are ignored");
{
  const result = optimize({
    parts: [
      { id: "p1", label: "On", length: 600, width: 400, qty: 2 },
      { id: "p2", label: "Off", length: 600, width: 400, qty: 2, enabled: false },
    ],
    stock: [
      { id: "s1", label: "Board", length: 1200, width: 800, qty: 0 },
      { id: "s2", label: "Ignored", length: 3000, width: 3000, qty: 0, enabled: false },
    ],
    settings: { kerf: 0, trim: 0 },
  });
  check("only the enabled part is cut", result.summary.placedCount === 2, `got ${result.summary.placedCount}`);
  check("the disabled stock size is never used", result.sheets.every((s) => s.label === "Board"));
}

section("13. Performance on a large job");
{
  const parts = [];
  for (let i = 0; i < 20; i++) {
    parts.push({ id: `p${i}`, label: `Part ${i}`, length: 200 + i * 37, width: 150 + ((i * 53) % 400), qty: 6 });
  }
  const t0 = Date.now();
  const result = optimize({
    parts,
    stock: [{ id: "s1", label: "Board", length: 2440, width: 1220, qty: 0 }],
    settings: { kerf: 3, trim: 0, effort: "balanced", timeBudgetMs: 4000 },
  });
  const ms = Date.now() - t0;
  const totalQty = parts.reduce((s, p) => s + p.qty, 0);
  check(`all ${totalQty} parts placed`, result.summary.placedCount === totalQty, `got ${result.summary.placedCount}`);
  check(`finishes inside the time budget (${ms}ms)`, ms < 8000, `${ms}ms`);
  check(
    `utilisation above 80% (${(result.summary.utilisation * 100).toFixed(1)}%)`,
    result.summary.utilisation > 0.8
  );
  assertSound(result, { kerf: 3, trim: 0 }, "large job");
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
