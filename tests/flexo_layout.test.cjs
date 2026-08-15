/**
 * Verification for the flexo step-and-repeat and gang-run engines.
 *
 * Both ship as ES modules for the React build, so they are loaded here by
 * stripping the export keywords and evaluating as CommonJS.
 *
 *   node tests/flexo_layout.test.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.join(__dirname, "..", "frontend", "src", "lib", "flexo");

function load() {
  const strip = (file) =>
    fs
      .readFileSync(path.join(DIR, file), "utf8")
      .replace(/^import[\s\S]*?;$/gm, "")
      .replace(/^export /gm, "");

  // Each module keeps its own closure — they share private names such as EPS,
  // so concatenating them into one scope would collide. gang.js's import of
  // layout.js is satisfied by destructuring the first module's exports.
  const source = `
    const layout = (function () {
      ${strip("layout.js")}
      return { solveStepRepeat, aroundFit, acrossFit, cylinderTeeth, round, PITCHES, getPitch, DEFAULT_FLEXO };
    })();
    const gang = (function () {
      const { aroundFit, cylinderTeeth, round } = layout;
      ${strip("gang.js")}
      return { solveGang };
    })();
    module.exports = { ...layout, ...gang };
  `;
  const sandbox = { module: { exports: {} }, console, Date };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "flexo.js" });
  return sandbox.module.exports;
}

const { solveStepRepeat, solveGang, aroundFit, acrossFit } = load();

let failures = 0;
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (n) => console.log(`\n${n}`);
const close = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

/* ------------------------------------------------------------------ */

section("1. Around the cylinder — the repeat is always filled exactly");
{
  // 100 teeth x 3.175 = 317.5 mm repeat, 60 mm labels, 3 mm minimum gap.
  const fit = aroundFit(317.5, 60, 3);
  check("fits 5 rows around", fit.count === 5, `got ${fit.count}`);
  check("gap opens up to absorb the remainder", close(fit.gap, 317.5 / 5 - 60), `${fit.gap}`);
  check("resulting gap is never below the minimum", fit.gap >= 3 - 1e-9, `${fit.gap}`);
  check(
    "rows plus gaps consume the whole repeat",
    close(fit.count * (60 + fit.gap), 317.5),
    `${fit.count * (60 + fit.gap)}`
  );
  check("a label taller than the repeat does not fit", aroundFit(100, 150, 3) === null);
}

section("2. Across the web — leftover width is edge trim, not free space");
{
  // 330 mm usable, 100 mm labels, 3 mm gutters -> 3 lanes, 24 mm left over.
  const fit = acrossFit(330, 100, 3, false);
  check("fits 3 lanes", fit.count === 3, `got ${fit.count}`);
  check("gutter stays at the minimum", close(fit.gap, 3), `${fit.gap}`);
  check("leftover is reported as trim", close(fit.leftover, 330 - (3 * 100 + 2 * 3)), `${fit.leftover}`);

  const spread = acrossFit(330, 100, 3, true);
  check("distributing widens the gutters instead", spread.count === 3 && close(spread.leftover, 0));
  check("widened gutter absorbs the leftover", close(spread.gap, (330 - 300) / 2), `${spread.gap}`);
  check(
    "distributed layout still spans the usable width",
    close(spread.count * 100 + (spread.count - 1) * spread.gap, 330)
  );
}

section("3. A known layout: 100 x 60 label, 330 web, 1/8 in pitch");
{
  const r = solveStepRepeat({
    label: { width: 100, height: 60, canRotate: false },
    webs: [{ width: 330 }],
    cylinders: { minTeeth: 60, maxTeeth: 200 },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 0,
    pitch: 3.175,
    quantity: 100000,
  });
  check("solves", r.ok === true, (r.errors || []).join(", "));
  const b = r.best;
  check("3 lanes across a 330 mm web", b.across === 3, `got ${b.across}`);
  check("repeat is a whole number of teeth", close(b.repeat, b.teeth * 3.175, 1e-6), `${b.repeat}`);
  check("labels per revolution is across x around", b.perRev === b.across * b.around);
  check("gap around meets the 3 mm minimum", b.gapAround >= 3 - 1e-9, `${b.gapAround}`);
  check(
    "material per label matches web area / labels per rev",
    close(b.materialPerLabel, (b.webWidth * b.repeat) / b.perRev, 1e-6)
  );
  check(
    "utilisation matches label area over web area",
    close(b.utilisation, (b.perRev * 100 * 60) / (330 * b.repeat), 1e-9),
    `${b.utilisation}`
  );
  check("run length covers the order", b.revolutions * b.perRev >= 100000);
  check("no shorter run would cover it", (b.revolutions - 1) * b.perRev < 100000);
  check(
    "web length is revolutions x repeat",
    close(b.webLength, b.revolutions * b.repeat, 0.01),
    `${b.webLength}`
  );
}

section("4. The ranking prefers cheaper material, not more labels per turn");
{
  const r = solveStepRepeat({
    label: { width: 100, height: 60, canRotate: true },
    webs: [{ width: 330 }, { width: 250 }],
    cylinders: { minTeeth: 60, maxTeeth: 200 },
    gapAcross: 3,
    gapAround: 3,
    pitch: 3.175,
  });
  const sorted = r.options.every(
    (o, i) => i === 0 || r.options[i - 1].materialPerLabel <= o.materialPerLabel + 1e-9
  );
  check("options are ordered by material per label", sorted);
  check("the best option is the cheapest per label", r.best === r.options[0]);
  const anyMorePerRev = r.options.some((o) => o.perRev > r.best.perRev);
  check(
    "a higher labels-per-rev option can still rank lower",
    anyMorePerRev || r.options.length === 1,
    "no denser option existed to compare"
  );
}

section("5. Rotation is evaluated and can win");
{
  // 200 wide x 40 high will not fit 2-up across a 250 web, but rotated it will.
  const fixed = solveStepRepeat({
    label: { width: 200, height: 40, canRotate: false },
    webs: [{ width: 250 }],
    cylinders: { minTeeth: 60, maxTeeth: 200 },
    gapAcross: 3,
    gapAround: 3,
    pitch: 3.175,
  });
  const free = solveStepRepeat({
    label: { width: 200, height: 40, canRotate: true },
    webs: [{ width: 250 }],
    cylinders: { minTeeth: 60, maxTeeth: 200 },
    gapAcross: 3,
    gapAround: 3,
    pitch: 3.175,
  });
  check("fixed orientation manages 1 lane", fixed.best.across === 1, `${fixed.best.across}`);
  check("rotation is offered", free.options.some((o) => o.rotated));
  check(
    "allowing rotation never costs more material",
    free.best.materialPerLabel <= fixed.best.materialPerLabel + 1e-9,
    `${free.best.materialPerLabel} vs ${fixed.best.materialPerLabel}`
  );
}

section("6. Edge margin and gutters are respected");
{
  const r = solveStepRepeat({
    label: { width: 100, height: 60, canRotate: false },
    webs: [{ width: 330 }],
    cylinders: { minTeeth: 100, maxTeeth: 100 },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 20,
    pitch: 3.175,
  });
  const b = r.best;
  const used = b.across * 100 + (b.across - 1) * b.gapAcross;
  check("layout stays inside the margins", used <= 330 - 40 + 1e-9, `${used} in ${330 - 40}`);
  check("edge waste includes both margins", b.edgeWaste >= 40 - 1e-9, `${b.edgeWaste}`);
  check("a 40 mm margin costs a lane here", b.across === 2, `got ${b.across}`);
}

section("7. Impossible inputs fail cleanly");
{
  const tooWide = solveStepRepeat({
    label: { width: 500, height: 60, canRotate: false },
    webs: [{ width: 330 }],
    cylinders: { minTeeth: 60, maxTeeth: 200 },
    pitch: 3.175,
  });
  check("a label wider than the web reports an error", tooWide.ok === false && tooWide.errors.length > 0);
  const noInput = solveStepRepeat({});
  check("missing input reports errors rather than throwing", noInput.ok === false && noInput.errors.length > 0);
}

section("8. Gang run — lanes follow the ordered quantities");
{
  const r = solveGang({
    skus: [
      { id: "a", name: "A", width: 100, height: 60, qty: 90000, canRotate: false },
      { id: "b", name: "B", width: 100, height: 60, qty: 30000, canRotate: false },
    ],
    webs: [{ width: 330 }],
    cylinders: { teeth: [100] },
    gapAcross: 3,
    gapAround: 3,
    pitch: 3.175,
  });
  check("solves", r.ok === true, (r.errors || []).join(", "));
  const a = r.best.lanes.find((l) => l.id === "a");
  const b = r.best.lanes.find((l) => l.id === "b");
  check("the 3:1 order gives A more lanes than B", a.lanes > b.lanes, `${a.lanes} vs ${b.lanes}`);
  check("every SKU meets its order", r.best.lanes.every((l) => l.printed >= l.ordered));
  check("overrun is the printed surplus", r.best.lanes.every((l) => l.overrun === l.printed - l.ordered));
  check(
    "total overrun matches the per-SKU sum",
    r.best.totalOverrun === r.best.lanes.reduce((s, l) => s + l.overrun, 0)
  );
  check(
    "the lanes fit the web",
    r.best.usedWidth <= 330 + 1e-9,
    `${r.best.usedWidth}`
  );
  check(
    "revolutions cover the slowest SKU",
    r.best.lanes.every((l) => r.best.revolutions * l.perRev >= l.ordered)
  );
}

section("9. Gang run — equal quantities give equal lanes");
{
  const r = solveGang({
    skus: [
      { id: "a", name: "A", width: 80, height: 50, qty: 50000, canRotate: false },
      { id: "b", name: "B", width: 80, height: 50, qty: 50000, canRotate: false },
    ],
    webs: [{ width: 330 }],
    cylinders: { teeth: [100] },
    gapAcross: 3,
    gapAround: 3,
    pitch: 3.175,
  });
  const [a, b] = r.best.lanes;
  check("identical SKUs get identical lanes", a.lanes === b.lanes, `${a.lanes} vs ${b.lanes}`);
  check("no overrun when the split is even", r.best.totalOverrun === 0, `${r.best.totalOverrun}`);
}

section("10. Gang run — a wider web is used when it saves material");
{
  const r = solveGang({
    skus: [
      { id: "a", name: "A", width: 100, height: 60, qty: 60000, canRotate: false },
      { id: "b", name: "B", width: 100, height: 60, qty: 60000, canRotate: false },
    ],
    webs: [{ width: 220, label: "narrow" }, { width: 430, label: "wide" }],
    cylinders: { teeth: [100] },
    gapAcross: 3,
    gapAround: 3,
    pitch: 3.175,
  });
  check("both webs were considered", r.options.some((o) => o.webLabel === "narrow") && r.options.some((o) => o.webLabel === "wide"));
  check(
    "the winner uses the least material",
    r.options.every((o) => o.materialArea >= r.best.materialArea - 1e-6)
  );
  check("plans are ordered by material", r.options.every((o, i) => i === 0 || r.options[i - 1].materialArea <= o.materialArea + 1e-6));
}

section("11. Gang run — guards and performance");
{
  const single = solveGang({
    skus: [{ id: "a", name: "A", width: 100, height: 60, qty: 1000 }],
    webs: [{ width: 330 }],
    cylinders: { teeth: [100] },
  });
  check("one SKU is not a gang run", single.ok === false);

  const t0 = Date.now();
  const big = solveGang({
    skus: [
      { id: "a", name: "A", width: 90, height: 55, qty: 120000 },
      { id: "b", name: "B", width: 70, height: 45, qty: 80000 },
      { id: "c", name: "C", width: 60, height: 40, qty: 45000 },
      { id: "d", name: "D", width: 50, height: 35, qty: 30000 },
    ],
    webs: [{ width: 330 }, { width: 430 }],
    cylinders: { minTeeth: 90, maxTeeth: 130 },
    gapAcross: 3,
    gapAround: 3,
    pitch: 3.175,
    timeBudgetMs: 4000,
  });
  const ms = Date.now() - t0;
  check(`4 SKUs across a cylinder range solves (${ms}ms)`, big.ok === true, (big.errors || []).join(", "));
  check("stays inside its time budget", ms < 6000, `${ms}ms`);
  check("every SKU is printed", big.best.lanes.length === 4 && big.best.lanes.every((l) => l.printed >= l.ordered));
  check("the plan fits the chosen web", big.best.usedWidth <= big.best.webWidth + 1e-9);
  check(
    "utilisation is a sane fraction",
    big.best.utilisation > 0 && big.best.utilisation <= 1,
    `${big.best.utilisation}`
  );
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
