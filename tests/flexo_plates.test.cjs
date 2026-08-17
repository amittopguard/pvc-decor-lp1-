/**
 * Verification for multi-plate gang planning and the PDF writer.
 *
 *   node tests/flexo_plates.test.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LIB = path.join(__dirname, "..", "frontend", "src", "lib");

function load() {
  const strip = (file) =>
    fs.readFileSync(file, "utf8").replace(/^import[\s\S]*?;$/gm, "").replace(/^export /gm, "");

  const source = `
    const layout = (function () {
      ${strip(path.join(LIB, "flexo", "layout.js"))}
      return { solveStepRepeat, aroundFit, acrossFit, cylinderTeeth, widthOptions, round, DEFAULT_PLATE_TOLERANCE };
    })();
    const gang = (function () {
      const { aroundFit, cylinderTeeth, round, DEFAULT_PLATE_TOLERANCE } = layout;
      ${strip(path.join(LIB, "flexo", "gang.js"))}
      return { solveGang };
    })();
    const plates = (function () {
      const { solveGang } = gang;
      const { cylinderTeeth, round } = layout;
      ${strip(path.join(LIB, "flexo", "plates.js"))}
      return { solvePlateSets, minimumWidth, diagnoseSplit };
    })();
    const pdf = (function () {
      ${strip(path.join(LIB, "pdf", "minipdf.js"))}
      return { createPdf, sanitise, textWidth };
    })();
    module.exports = { ...layout, ...gang, ...plates, pdf };
  `;
  const sandbox = { module: { exports: {} }, console, Date, Blob: class {}, URL: {}, document: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "flexo-plates.js" });
  return sandbox.module.exports;
}

const { solvePlateSets, minimumWidth, diagnoseSplit, pdf } = load();

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

const PRESS = {
  webRange: { min: 320, max: 650 },
  cylinders: { teeth: [96, 104, 112, 120, 128, 136] },
  gapAcross: 3,
  gapAround: 3,
  edgeMargin: 5,
  pitch: 3.175,
};

/** Ten SKUs too wide to share one 650 mm plate. */
const TEN_WIDE = Array.from({ length: 10 }, (_, i) => ({
  id: `s${i}`,
  name: `Label ${i + 1}`,
  width: 90 + (i % 3) * 15,
  height: 50 + (i % 4) * 10,
  qty: 20000 + i * 6000,
  canRotate: true,
}));

/* ------------------------------------------------------------------ */

section("1. Ten wide SKUs are split across several plates");
{
  const single = minimumWidth(TEN_WIDE, 3, 5);
  check(
    "all ten at one lane each are wider than the press",
    single > 650,
    `${single.toFixed(0)} mm needed, press is 650`
  );

  const r = solvePlateSets({ ...PRESS, skus: TEN_WIDE });
  check("solves", r.ok === true, (r.errors || []).join(", "));
  check("more than one plate is planned", r.totals.plates > 1, `${r.totals.plates} plates`);
  check("every SKU is placed exactly once", (() => {
    const ids = r.plates.flatMap((p) => p.plan.lanes.map((l) => l.id));
    return ids.length === TEN_WIDE.length && new Set(ids).size === TEN_WIDE.length;
  })(), "SKUs missing or duplicated across plates");
  check(
    "every plate fits the press width",
    r.plates.every((p) => p.plan.webWidth <= 650 + 1e-9 && p.plan.webWidth >= 320 - 1e-9),
    r.plates.map((p) => p.plan.webWidth).join(", ")
  );
  check(
    "every SKU meets its ordered quantity",
    r.plates.every((p) => p.plan.lanes.every((l) => l.printed >= l.ordered))
  );
  check(
    "totals match the sum of the plates",
    Math.abs(r.totals.materialArea - r.plates.reduce((s, p) => s + p.plan.materialArea, 0)) < 1,
    `${r.totals.materialArea}`
  );
  check(
    "ordered total matches the input",
    r.totals.ordered === TEN_WIDE.reduce((s, x) => s + x.qty, 0),
    `${r.totals.ordered}`
  );
  check("overrun is printed minus ordered", r.totals.overrun === r.totals.printed - r.totals.ordered);
  check("a grouping strategy is reported", typeof r.strategy === "string" && r.strategy.length > 0);
  console.log(
    `       → ${r.totals.plates} plates, widths ${r.plates.map((p) => Math.round(p.plan.webWidth)).join(" / ")}, ` +
      `overrun ${(r.totals.overrunPct * 100).toFixed(1)}%`
  );
}

section("2. A job that does fit stays on one plate");
{
  const narrow = Array.from({ length: 4 }, (_, i) => ({
    id: `n${i}`,
    name: `Small ${i + 1}`,
    width: 40,
    height: 30,
    qty: 40000,
    canRotate: true,
  }));
  const r = solvePlateSets({ ...PRESS, skus: narrow });
  check("solves", r.ok === true, (r.errors || []).join(", "));
  check("uses a single plate", r.totals.plates === 1, `${r.totals.plates} plates`);
  check("all four SKUs share it", r.plates[0].plan.lanes.length === 4);
}

section("3. A single SKU is still planned");
{
  const r = solvePlateSets({ ...PRESS, skus: [{ id: "a", name: "Only", width: 100, height: 60, qty: 50000 }] });
  check("solves", r.ok === true, (r.errors || []).join(", "));
  check("one plate, one SKU", r.totals.plates === 1 && r.plates[0].plan.lanes.length === 1);
  check("it meets the order", r.plates[0].plan.lanes[0].printed >= 50000);
}

section("4. A SKU wider than the press is rejected clearly");
{
  const r = solvePlateSets({
    ...PRESS,
    skus: [
      { id: "a", name: "Giant", width: 900, height: 800, qty: 1000, canRotate: true },
      { id: "b", name: "Fine", width: 100, height: 60, qty: 1000 },
    ],
  });
  check("reports failure rather than looping", r.ok === false);
  check("the error names the offending SKU", r.errors.join(" ").includes("Giant"), r.errors.join(" "));
}

section("5. Sixteen SKUs stay inside the time budget");
{
  const many = Array.from({ length: 16 }, (_, i) => ({
    id: `m${i}`,
    name: `SKU ${i + 1}`,
    width: 60 + (i % 5) * 12,
    height: 40 + (i % 3) * 15,
    qty: 10000 + i * 3000,
    canRotate: true,
  }));
  const t0 = Date.now();
  const r = solvePlateSets({ ...PRESS, skus: many, timeBudgetMs: 8000 });
  const ms = Date.now() - t0;
  check(`solves 16 SKUs (${ms}ms)`, r.ok === true, (r.errors || []).join(", "));
  check("finishes inside the budget", ms < 12000, `${ms}ms`);
  check("every SKU is placed once", (() => {
    const ids = r.plates.flatMap((p) => p.plan.lanes.map((l) => l.id));
    return ids.length === many.length && new Set(ids).size === many.length;
  })());
  console.log(`       → ${r.totals.plates} plates in ${ms}ms`);
}

section("6. PDF writer produces a structurally valid file");
{
  const doc = pdf.createPdf({ title: "Test report" });
  doc.text(40, 40, "Flexo gang run report", { size: 16, bold: true });
  doc.text(40, 60, "100 × 60 label — ×²—’ folded to ASCII", { size: 10 });
  doc.rect(40, 80, 200, 100, { fill: "#bfdbfe", stroke: "#0f172a" });
  doc.line(40, 200, 400, 200, { color: "#dc2626", dash: "3 2" });
  doc.addPage();
  doc.text(40, 40, "Plate 2", { size: 14, bold: true });
  const bytes = doc.toBytes();
  const text = Buffer.from(bytes).toString("latin1");

  check("starts with a PDF header", text.startsWith("%PDF-1.4"));
  check("ends with the EOF marker", text.trimEnd().endsWith("%%EOF"));
  check("declares both pages", /\/Count 2\b/.test(text), text.match(/\/Count \d+/)?.[0]);
  check("embeds both Helvetica faces", text.includes("/Helvetica") && text.includes("/Helvetica-Bold"));
  check("non-Latin characters are folded, not dropped", text.includes("100 x 60"), "the multiplication sign survived");
  check("no raw multiplication sign reaches the file", !text.includes("×"));

  // Every xref offset must land on its object header.
  const xrefStart = parseInt(text.slice(text.lastIndexOf("startxref") + 9).trim(), 10);
  check("startxref points at the xref table", text.slice(xrefStart, xrefStart + 4) === "xref", `${xrefStart}`);
  const xref = text.slice(xrefStart);
  const entries = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => parseInt(m[1], 10));
  check("an xref entry exists for every object", entries.length >= 7, `${entries.length} entries`);
  const misaligned = entries.filter((off, i) => !new RegExp(`^${i + 1} 0 obj`).test(text.slice(off, off + 20)));
  check("every offset lands on its object", misaligned.length === 0, `${misaligned.length} misaligned`);
  check("the file is a sane size", bytes.length > 700 && bytes.length < 400000, `${bytes.length} bytes`);

  fs.writeFileSync(path.join(require("os").tmpdir(), "minipdf-sample.pdf"), bytes);
}

section("7. Text measurement is usable for layout");
{
  const wide = pdf.textWidth("WWWWW", 10);
  const thin = pdf.textWidth("iiiii", 10);
  check("wide glyphs measure wider than narrow ones", wide > thin * 2, `${wide} vs ${thin}`);
  check("bold measures at least as wide as regular", pdf.textWidth("Hello", 10, true) >= pdf.textWidth("Hello", 10));
  check("an empty string measures zero", pdf.textWidth("", 10) === 0);
}

section("8. Splitting over more plates is a money decision");
{
  // Ten SKUs that cannot share one plate, so the planner has a real choice
  // about how many plates to use.
  const skus = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i}`,
    name: `Label ${i + 1}`,
    width: 90 + (i % 4) * 15,
    height: 50 + (i % 3) * 12,
    qty: 20000 + i * 5000,
  }));
  const job = {
    skus,
    webRange: { min: 320, max: 650 },
    cylinders: { teeth: [96, 104, 112, 120, 128, 136] },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    pitch: 3.175,
  };
  const priceWith = (colours, plateRate = 1.3, filmPerSqm = 15.4) => (plan) => ({
    plateCost: ((plan.repeat * plan.webWidth) / 100) * plateRate * colours,
    materialCost: (plan.materialArea / 1e6) * filmPerSqm,
  });

  const plain = solvePlateSets(job);
  check("without rates it still ranks on plate count", plain.rankedBy === "plates", plain.rankedBy);
  check("and reports no money", plain.totals.totalCost === null, `${plain.totals.totalCost}`);

  const priced = solvePlateSets({ ...job, cost: priceWith(4) });
  check("with rates it ranks on cost", priced.rankedBy === "cost", priced.rankedBy);
  check("the winner is priced", priced.totals.totalCost > 0, `${priced.totals.totalCost}`);
  check(
    "plates plus film is the whole bill",
    Math.abs(priced.totals.totalCost - (priced.totals.plateCost + priced.totals.materialCost)) < 1e-6
  );
  check(
    "per thousand is the bill over everything ordered",
    Math.abs(priced.totals.costPerThousand - (priced.totals.totalCost / priced.totals.ordered) * 1000) < 1e-6,
    `${priced.totals.costPerThousand}`
  );
  check(
    "each plate carries its own share",
    priced.plates.every((p) => p.cost && p.cost.plateCost > 0),
    JSON.stringify(priced.plates.map((p) => p.cost && Math.round(p.cost.plateCost)))
  );
  check(
    "the alternatives are listed cheapest first",
    priced.alternatives.every((a, i) => i === 0 || a.totalCost >= priced.alternatives[i - 1].totalCost - 1e-6),
    priced.alternatives.map((a) => `${a.plates}p:${Math.round(a.totalCost)}`).join(", ")
  );
  check(
    "and the winner is the cheapest of them",
    Math.abs(priced.alternatives[0].totalCost - priced.totals.totalCost) < 1e-6
  );

  // Plates are bought per colour, so a many-colour job should never be split
  // over more plates than a one-colour job would be.
  const one = solvePlateSets({ ...job, cost: priceWith(1) });
  const twelve = solvePlateSets({ ...job, cost: priceWith(12) });
  check(
    "twelve colours never uses more plates than one colour",
    twelve.totals.plates <= one.totals.plates,
    `${twelve.totals.plates} vs ${one.totals.plates}`
  );

  check(
    "a pricing function returning nothing is ignored",
    solvePlateSets({ ...job, cost: () => null }).rankedBy === "plates"
  );

  // Every SKU still has to be printed, whichever way the split is ranked.
  const printedFor = (r) =>
    r.plates.reduce((s, p) => s + p.plan.lanes.reduce((t, l) => t + l.printed, 0), 0);
  check("the cost-ranked plan still meets every order", printedFor(priced) >= priced.totals.ordered);
  check(
    "and every SKU appears exactly once",
    priced.plates.flatMap((p) => p.plan.lanes.map((l) => l.id)).sort().join(",") ===
      skus.map((s) => s.id).sort().join(","),
    priced.plates.flatMap((p) => p.plan.lanes.map((l) => l.id)).join(",")
  );
}

section("9. A split says what is actually stopping it");
{
  // The real job: 597 x 191 and 372 x 133.2. Their short sides add to 324 mm,
  // which the press prints easily — so the split looks wrong until you see
  // that fitting them side by side means turning them.
  const skus = [
    { id: "a", name: "222a3825", width: 597, height: 191, qty: 2500 },
    { id: "b", name: "SKU 1", width: 372, height: 133.2, qty: 2500 },
  ];
  const press = {
    webRange: { min: 320, max: 650 },
    gapAcross: 3,
    gapAround: 3,
    edgeMargin: 5,
    pitch: 3.175,
  };

  const small = solvePlateSets({ ...press, cylinders: { teeth: [96, 104, 112, 120, 128, 136] }, skus });
  check("with a small cylinder they cannot share a plate", small.totals.plates === 2, `${small.totals.plates}`);
  check("and the reason given is the cylinder", small.split?.reason === "cylinder", JSON.stringify(small.split));
  check(
    "the width they need is inside the press",
    small.split.neededWidth <= small.split.widest,
    `${small.split.neededWidth} vs ${small.split.widest}`
  );
  check("324 of label plus gutter and margins is 337.2", Math.abs(small.split.neededWidth - 337.2) < 1e-6,
        `${small.split.neededWidth}`);
  check("turning the long one needs 600 mm of repeat", Math.abs(small.split.neededRepeat - 600) < 1e-6,
        `${small.split.neededRepeat}`);
  check("which is a 189-tooth cylinder", small.split.neededTeeth === 189, `${small.split.neededTeeth}`);
  check("against a largest of 136T", small.split.biggestTeeth === 136, `${small.split.biggestTeeth}`);
  check("and it names the label that drives it", small.split.driverName === "222a3825", small.split.driverName);

  // Give the press a cylinder big enough and the same two go on one plate.
  const big = solvePlateSets({ ...press, cylinders: { minTeeth: 60, maxTeeth: 200 }, skus });
  check("a 200-tooth range puts them on one plate", big.totals.plates === 1, `${big.totals.plates}`);
  check("and then there is nothing to explain", big.split === null, JSON.stringify(big.split));
  check("that plate is slit to the width the diagnosis predicted",
        Math.abs(big.plates[0].plan.webWidth - 337.2) < 0.5, `${big.plates[0].plan.webWidth}`);
  check("with both labels turned", big.plates[0].plan.lanes.every((l) => l.rotated),
        JSON.stringify(big.plates[0].plan.lanes.map((l) => l.rotated)));

  // When the press really is too narrow, say that instead.
  const narrow = solvePlateSets({
    ...press,
    webRange: { min: 320, max: 330 },
    cylinders: { minTeeth: 60, maxTeeth: 260 },
    skus: [
      { id: "x", name: "X", width: 300, height: 200, qty: 1000 },
      { id: "y", name: "Y", width: 300, height: 200, qty: 1000 },
    ],
  });
  check("a genuinely narrow press is blamed on width", narrow.split?.reason === "width", JSON.stringify(narrow.split));

  check("a single SKU has nothing to diagnose", diagnoseSplit([skus[0]], {
    gutter: 3, margin: 5, widest: 650, teethList: [136], pitch: 3.175,
  }) === null);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
