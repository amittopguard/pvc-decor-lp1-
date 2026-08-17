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
      return { solveStepRepeat, aroundFit, acrossFit, cylinderTeeth, widthOptions, round, PITCHES, getPitch, DEFAULT_FLEXO, DEFAULT_PLATE_TOLERANCE };
    })();
    const gang = (function () {
      const { aroundFit, cylinderTeeth, round, DEFAULT_PLATE_TOLERANCE } = layout;
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
  // Ranking is by cost bucket, so layouts that tie on material within the
  // tolerance are ordered by the smaller cylinder rather than by raw cost.
  const sorted = r.options.every(
    (o, i) =>
      i === 0 ||
      r.options[i - 1].costBucket < o.costBucket ||
      (r.options[i - 1].costBucket === o.costBucket && r.options[i - 1].repeat <= o.repeat + 1e-9)
  );
  check("options are ordered by cost, then by the smaller plate", sorted);
  check(
    "the best option is within the tolerance of the cheapest per label",
    r.best.materialPerLabel <= Math.min(...r.options.map((o) => o.materialPerLabel)) * 1.005 + 1e-9,
    `${r.best.materialPerLabel}`
  );
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

section("12. Press width rule — slit anywhere between 320 and 650 mm");
{
  const r = solveStepRepeat({
    label: { width: 100, height: 60, canRotate: true },
    webRange: { min: 320, max: 650 },
    cylinders: { teeth: [96, 104, 112, 120, 128, 136] },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    pitch: 3.175,
    quantity: 100000,
  });
  check("solves against a width range", r.ok === true, (r.errors || []).join(", "));
  check(
    "every option stays inside the press width limits",
    r.options.every((o) => o.webWidth >= 320 - 1e-9 && o.webWidth <= 650 + 1e-9),
    r.options.map((o) => o.webWidth).join(", ")
  );

  const b = r.best;
  const block = b.across * b.labelWidth + (b.across - 1) * b.gapAcross;
  check(
    "the recommended width is the lanes plus gutters and margins",
    Math.abs(b.webWidth - Math.max(320, block + 10)) < 1e-6,
    `${b.webWidth} vs block ${block}`
  );
  check("the width beats the old fixed 330 web", b.webWidth > 330, `${b.webWidth}`);

  const fixed330 = solveStepRepeat({
    label: { width: 100, height: 60, canRotate: true },
    webs: [{ width: 330 }],
    cylinders: { teeth: [96, 104, 112, 120, 128, 136] },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    pitch: 3.175,
  });
  check(
    "choosing the width costs less material per label than a fixed 330 web",
    b.materialPerLabel < fixed330.best.materialPerLabel,
    `${b.materialPerLabel.toFixed(0)} vs ${fixed330.best.materialPerLabel.toFixed(0)}`
  );
}

section("13. A narrow label still pays for the minimum print width");
{
  const r = solveStepRepeat({
    label: { width: 40, height: 30, canRotate: false },
    webRange: { min: 320, max: 650 },
    cylinders: { teeth: [100] },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    pitch: 3.175,
  });
  const single = r.options.find((o) => o.across === 1);
  check("a single lane is still offered", !!single);
  check("but it is charged at the 320 mm minimum", single.webWidth === 320, `${single.webWidth}`);
  check("and the unused width shows up as trim", single.edgeWaste > 270, `${single.edgeWaste}`);
  check(
    "the winner fills the web rather than running one lane",
    r.best.across > 1 && r.best.materialPerLabel < single.materialPerLabel,
    `${r.best.across} lanes`
  );
}

section("14. Repeat rule — equal cost is broken by the smaller cylinder");
{
  // 60 mm label with a 3 mm gap divides 100T, 200T and 300T equally well, so
  // all three cost the same material and the smallest plate should win.
  const r = solveStepRepeat({
    label: { width: 100, height: 60, canRotate: false },
    webs: [{ width: 330 }],
    cylinders: { teeth: [100, 200, 300] },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 0,
    pitch: 3.175,
  });
  const cost = (t) => r.options.find((o) => o.teeth === t).materialPerLabel;
  check("the three cylinders cost the same per label", Math.abs(cost(100) - cost(300)) / cost(100) < 0.005);
  check("the smallest cylinder is chosen", r.best.teeth === 100, `chose ${r.best.teeth}T`);
  check(
    "options are ordered by cost bucket, then repeat",
    r.options.every(
      (o, i) =>
        i === 0 ||
        r.options[i - 1].costBucket < o.costBucket ||
        (r.options[i - 1].costBucket === o.costBucket && r.options[i - 1].repeat <= o.repeat + 1e-9)
    )
  );

  // A genuinely cheaper layout must still outrank a smaller cylinder.
  const wide = solveStepRepeat({
    label: { width: 100, height: 60, canRotate: false },
    webs: [{ width: 330 }],
    cylinders: { teeth: [61, 139] },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 0,
    pitch: 3.175,
  });
  check(
    "a materially cheaper layout still beats the smaller plate",
    wide.best.materialPerLabel <= wide.options[wide.options.length - 1].materialPerLabel + 1e-9
  );
}

section("15. Gang run against the width range");
{
  const r = solveGang({
    skus: [
      { id: "a", name: "A", width: 100, height: 60, qty: 90000 },
      { id: "b", name: "B", width: 100, height: 60, qty: 30000 },
      { id: "c", name: "C", width: 60, height: 40, qty: 45000 },
    ],
    webRange: { min: 320, max: 650 },
    cylinders: { teeth: [96, 104, 112, 120, 128, 136] },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    pitch: 3.175,
  });
  check("solves", r.ok === true, (r.errors || []).join(", "));
  check(
    "the plan stays inside the press width limits",
    r.options.every((o) => o.webWidth >= 320 - 1e-9 && o.webWidth <= 650 + 1e-9),
    r.options.map((o) => o.webWidth).join(", ")
  );
  check(
    "the recommended width matches the lanes it carries",
    Math.abs(r.best.webWidth - Math.max(320, r.best.usedWidth + 10)) < 1e-6,
    `${r.best.webWidth} vs used ${r.best.usedWidth}`
  );
  check("every SKU meets its order", r.best.lanes.every((l) => l.printed >= l.ordered));
  check(
    "material equals turns × web × repeat",
    Math.abs(r.best.materialArea - r.best.revolutions * r.best.webWidth * r.best.repeat) < 1,
    `${r.best.materialArea}`
  );

  const fixed = solveGang({
    skus: [
      { id: "a", name: "A", width: 100, height: 60, qty: 90000 },
      { id: "b", name: "B", width: 100, height: 60, qty: 30000 },
      { id: "c", name: "C", width: 60, height: 40, qty: 45000 },
    ],
    webs: [{ width: 330 }],
    cylinders: { teeth: [96, 104, 112, 120, 128, 136] },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    pitch: 3.175,
  });
  check(
    "choosing the width uses no more material than a fixed 330 web",
    r.best.materialArea <= fixed.best.materialArea + 1e-6,
    `${r.best.materialArea.toFixed(0)} vs ${fixed.best.materialArea.toFixed(0)}`
  );
}

section("Ranking by rupees rather than square millimetres");
{
  // The same pricing the app supplies, written out here so the layout engine
  // stays free of any costing import.
  const priceWith = (quantity, colours, plateRate = 1.3, filmPerSqm = 15.4) => (o) => {
    const plateCost = ((o.repeat * o.webWidth) / 100) * plateRate * colours;
    const materialCost = (o.materialArea / 1e6) * filmPerSqm;
    const totalCost = plateCost + materialCost;
    return { plateCost, materialCost, totalCost, costPerThousand: (totalCost / quantity) * 1000 };
  };

  const job = {
    label: { width: 100, height: 60, canRotate: true },
    webRange: { min: 320, max: 650 },
    cylinders: { minTeeth: 60, maxTeeth: 200 },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    pitch: 3.175,
  };

  const unpriced = solveStepRepeat({ ...job, quantity: 100000 });
  check("without rates it still ranks on material", unpriced.rankedBy === "material", unpriced.rankedBy);
  check("and every option carries no price", unpriced.best.costPerThousand === undefined);

  const priced = solveStepRepeat({ ...job, quantity: 100000, cost: priceWith(100000, 4) });
  check("with rates it ranks on cost", priced.rankedBy === "cost", priced.rankedBy);
  check("the best option is priced", priced.best.costPerThousand > 0, `${priced.best.costPerThousand}`);
  // Layouts within the plate tolerance of each other share a bucket and break
  // ties to the smaller cylinder, so cost rises by bucket rather than by row.
  check(
    "cost rises bucket by bucket",
    priced.options.every((o, i) => i === 0 || o.costBucket >= priced.options[i - 1].costBucket),
    priced.options.slice(0, 6).map((o) => `${o.costBucket}:${o.costPerThousand.toFixed(2)}`).join(", ")
  );
  check(
    "and inside a bucket the smaller cylinder comes first",
    priced.options.every(
      (o, i) => i === 0 || o.costBucket !== priced.options[i - 1].costBucket || o.repeat >= priced.options[i - 1].repeat
    )
  );

  // The point of the whole change: the cheapest layout is not the one that uses
  // the least film, because the plate is bought by the square centimetre.
  const leanest = unpriced.best;
  const plateArea = (o) => (o.repeat * o.webWidth) / 100;
  check(
    "the tightest layout is not the cheapest at 100k",
    leanest.id !== priced.best.id,
    `${leanest.id} vs ${priced.best.id}`
  );
  check(
    "the cheapest uses a narrower web",
    priced.best.webWidth < leanest.webWidth,
    `${priced.best.webWidth} vs ${leanest.webWidth}`
  );
  check(
    "which is exactly the plate being smaller",
    plateArea(priced.best) < plateArea(leanest),
    `${plateArea(priced.best).toFixed(0)} vs ${plateArea(leanest).toFixed(0)} cm2`
  );
  check(
    "and it pays for that with more film per label",
    priced.best.materialPerLabel > leanest.materialPerLabel,
    `${priced.best.materialPerLabel.toFixed(2)} vs ${leanest.materialPerLabel.toFixed(2)}`
  );

  // Run it long enough and the plate stops mattering, so the tighter layout wins.
  const huge = 50000000;
  const long = solveStepRepeat({ ...job, quantity: huge, cost: priceWith(huge, 4) });
  check(
    "over a very long run the choice swings back to the tighter layout",
    long.best.materialPerLabel < priced.best.materialPerLabel,
    `${long.best.materialPerLabel.toFixed(2)} vs ${priced.best.materialPerLabel.toFixed(2)}`
  );
  check(
    "on a wider web",
    long.best.webWidth > priced.best.webWidth,
    `${long.best.webWidth} vs ${priced.best.webWidth}`
  );

  // More colours means more plates, which pushes the answer narrower still.
  const oneColour = solveStepRepeat({ ...job, quantity: 100000, cost: priceWith(100000, 1) });
  const eight = solveStepRepeat({ ...job, quantity: 100000, cost: priceWith(100000, 8) });
  check(
    "eight colours never picks a wider web than one",
    eight.best.webWidth <= oneColour.best.webWidth,
    `${eight.best.webWidth} vs ${oneColour.best.webWidth}`
  );

  check(
    "a zero quantity falls back to material, not a divide by zero",
    solveStepRepeat({ ...job, quantity: 0, cost: priceWith(1, 4) }).rankedBy === "material"
  );
  check(
    "a pricing function that returns nothing is ignored",
    solveStepRepeat({ ...job, quantity: 100000, cost: () => null }).rankedBy === "material"
  );
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
