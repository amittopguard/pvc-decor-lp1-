/**
 * Verification for the job costing engine.
 *
 *   node tests/costing.test.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "frontend", "src", "lib", "costing", "costing.js");

function load() {
  const code = fs.readFileSync(SRC, "utf8").replace(/^export /gm, "");
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(
    `${code}\nmodule.exports = { gsm, sqmPerKg, filmCostPerSqm, filmCostPerKg, plateCost, jobCost, breakEven, toSquareMetres, toSquareCm, DEFAULT_RATES, FILM_DENSITY };`,
    sandbox,
    { filename: "costing.js" }
  );
  return sandbox.module.exports;
}

const C = load();

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
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

/* ------------------------------------------------------------------ */

section("1. Film weight — the bridge between per-kg and per-m2");
{
  // A square metre one micron thick is one cubic centimetre, so gsm = micron x density.
  check("50 micron PVC at 1.35 is 67.5 gsm", near(C.gsm(50, 1.35), 67.5), `${C.gsm(50, 1.35)}`);
  check("20 micron BOPP at 0.91 is 18.2 gsm", near(C.gsm(20, 0.91), 18.2, 1e-9), `${C.gsm(20, 0.91)}`);
  check("one kilo of 50 micron PVC gives 14.81 m2", near(C.sqmPerKg(50, 1.35), 1000 / 67.5, 1e-9), `${C.sqmPerKg(50, 1.35)}`);
  check("missing thickness yields zero, not infinity", C.sqmPerKg(0, 1.35) === 0);
}

section("2. A per-kg rate and a per-m2 rate meet in the middle");
{
  const perKg = { mode: "per_kg", ratePerKg: 220, micron: 50, density: 1.35 };
  const costSqm = C.filmCostPerSqm(perKg);
  // 220 per kg over 14.81 m2 per kg is 14.85 per m2.
  check("220/kg on 67.5 gsm is 14.85 per m2", near(costSqm, 220 * 0.0675, 1e-9), `${costSqm}`);

  const perSqm = { mode: "per_sqm", ratePerSqm: costSqm, micron: 50, density: 1.35 };
  check(
    "quoting that per m2 rate back per kg returns the original",
    near(C.filmCostPerKg(perSqm), 220, 1e-9),
    `${C.filmCostPerKg(perSqm)}`
  );
  check("a per-kg film reports its own rate per kg unchanged", near(C.filmCostPerKg(perKg), 220));

  // Thicker film costs more per square metre at the same rupees per kilo.
  const thick = C.filmCostPerSqm({ ...perKg, micron: 100 });
  check("doubling the thickness doubles the cost per m2", near(thick, costSqm * 2, 1e-9), `${thick}`);
}

section("3. Plates are charged per colour, per set");
{
  const rates = { ...C.DEFAULT_RATES, plateRatePerCm2: 1.3, mountingPerPlate: 0 };
  // 381 mm repeat x 625 mm web = 2381.25 cm2.
  const areaCm2 = (381 * 625) / 100;
  const one = C.plateCost({ areaCm2, colours: 1, sets: 1, rates });
  check("a single plate is area times rate", near(one.total, areaCm2 * 1.3, 1e-6), `${one.total}`);

  const six = C.plateCost({ areaCm2, colours: 6, sets: 1, rates });
  check("six colours means six plates", six.plateCount === 6, `${six.plateCount}`);
  check("and six times the cost", near(six.total, one.total * 6, 1e-6), `${six.total}`);

  const twoSets = C.plateCost({ areaCm2, colours: 6, sets: 2, rates });
  check("six colours on two plate sets is twelve plates", twoSets.plateCount === 12, `${twoSets.plateCount}`);
  check("not two", twoSets.plateCount !== 2);

  const lo = C.plateCost({ areaCm2, colours: 1, sets: 1, rates: { ...rates, plateRatePerCm2: 1.2 } });
  const hi = C.plateCost({ areaCm2, colours: 1, sets: 1, rates: { ...rates, plateRatePerCm2: 1.4 } });
  check("the 1.2 to 1.4 band moves the plate bill", hi.total > lo.total, `${lo.total} vs ${hi.total}`);
  check("a 2381 cm2 plate lands between 2857 and 3334", lo.total > 2800 && hi.total < 3400, `${lo.total}–${hi.total}`);
}

section("4. Area conversion from the optimiser's working unit");
{
  check("one square metre of mm2 is one m2", near(C.toSquareMetres(1e6, "mm"), 1));
  check("and ten thousand cm2", near(C.toSquareCm(1e6, "mm"), 1e4));
  check("inches convert too", near(C.toSquareMetres(1550.0031, "in"), 1, 1e-4), `${C.toSquareMetres(1550.0031, "in")}`);
}

section("5. Whole job cost, and cost per thousand labels");
{
  const rates = {
    ...C.DEFAULT_RATES,
    plateRatePerCm2: 1.3,
    mountingPerPlate: 0,
    film: { mode: "per_kg", ratePerKg: 220, micron: 50, density: 1.35 },
  };
  // 100,000 labels, 2117 m of 625 mm web = 1323 m2 of film.
  const materialArea = 2117000 * 625; // mm2
  const job = C.jobCost({
    materialArea,
    unit: "mm",
    plateAreaCm2: (381 * 625) / 100,
    colours: 4,
    sets: 1,
    quantity: 100000,
    rates,
  });

  check("four plates for a four-colour job", job.plates.plateCount === 4, `${job.plates.plateCount}`);
  check("film area is web length times width", near(job.materialSqm, 1323.125, 1e-3), `${job.materialSqm}`);
  check("total is plates plus film", near(job.total, job.plates.total + job.materialCost, 1e-6));
  check(
    "cost per thousand splits into plate and film",
    near(job.perThousand, job.platePerThousand + job.materialPerThousand, 1e-9),
    `${job.perThousand}`
  );
  check("per thousand is positive and sane", job.perThousand > 0 && job.perThousand < 1e6, `${job.perThousand}`);
  check("zero quantity does not divide by zero", C.jobCost({ ...{ materialArea, unit: "mm" }, quantity: 0, rates }).perThousand === 0);
}

section("6. Break-even between two layouts");
{
  const rates = { ...C.DEFAULT_RATES, film: { mode: "per_kg", ratePerKg: 220, micron: 50, density: 1.35 } };
  const base = { unit: "mm", plateAreaCm2: 2000, colours: 4, quantity: 100000, rates };

  // A: one plate set, wastes more film. B: two sets, tighter layout.
  const A = C.jobCost({ ...base, sets: 1, materialArea: 1500000 * 625 });
  const B = C.jobCost({ ...base, sets: 2, materialArea: 1400000 * 625 });

  check("B costs more in plates", B.plates.total > A.plates.total);
  check("but less in film", B.materialCost < A.materialCost);

  const be = C.breakEven(A, B);
  check("a crossover quantity exists", be.quantity !== null && be.quantity > 0, JSON.stringify(be));
  check("it is explained in words", typeof be.reason === "string" && be.reason.length > 0, be.reason);

  // Below the crossover A wins, above it B wins — check by recosting at each side.
  const at = be.quantity;
  const costAtQty = (opt, qty) => (opt.plates.total + (opt.materialCost / opt.quantity) * qty) / qty;
  check(
    "below the crossover the cheaper-to-tool option wins",
    costAtQty(A, Math.max(1, Math.floor(at * 0.5))) < costAtQty(B, Math.max(1, Math.floor(at * 0.5)))
  );
  check("above it the tighter layout wins", costAtQty(A, at * 2) > costAtQty(B, at * 2));

  // When one option is better on both counts there is nothing to trade.
  const worse = C.jobCost({ ...base, sets: 3, materialArea: 1600000 * 625 });
  const none = C.breakEven(A, worse);
  check("no crossover when an option is worse on both counts", none.quantity === null, JSON.stringify(none));
}

section("7. Defaults match the quoted rates");
{
  check("plate rate defaults inside the 1.2 to 1.4 band",
    C.DEFAULT_RATES.plateRatePerCm2 >= 1.2 && C.DEFAULT_RATES.plateRatePerCm2 <= 1.4);
  check("mounting tape is not charged separately", C.DEFAULT_RATES.mountingPerPlate === 0);
  check("film defaults to per kilo, the common case", C.DEFAULT_RATES.film.mode === "per_kg");
  check("PVC density is on file", near(C.FILM_DENSITY.PVC, 1.35));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
