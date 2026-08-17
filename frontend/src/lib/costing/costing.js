/**
 * Costing for label jobs.
 *
 * Film arrives priced two ways — mostly per kilo, sometimes per square metre —
 * so everything is converted to a cost per square metre before it is used. The
 * bridge between the two is the film's own weight: a square metre of film
 * weighs its thickness times its density, which is what makes a per-kg rate
 * comparable with a per-m2 one.
 *
 * Plates are charged on area, and a flexo job needs one plate per colour per
 * plate set — six colours on two plate sets is twelve plates, not two. Getting
 * that wrong understates the plate bill by the colour count.
 */

export const DEFAULT_RATES = {
  // Plate rate runs about 1.2 to 1.4 per square centimetre.
  plateRatePerCm2: 1.3,
  plateRateMin: 1.2,
  plateRateMax: 1.4,
  // Mounting tape is part of the job, not a separate charge.
  mountingPerPlate: 0,
  film: {
    mode: "per_kg", // "per_kg" | "per_sqm"
    ratePerKg: 220,
    ratePerSqm: 0,
    micron: 50,
    density: 1.35, // PVC ~1.35, BOPP ~0.91, PET ~1.4
  },
  currency: "₹",
};

/** Common film densities, g/cm3. */
export const FILM_DENSITY = {
  PVC: 1.35,
  BOPP: 0.91,
  PET: 1.4,
  PE: 0.92,
  PAPER: 0.8,
};

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Grams per square metre.
 *
 * A square metre of film one micron thick is exactly one cubic centimetre, so
 * grams per square metre is simply microns times density.
 */
export function gsm(micron, density) {
  const m = num(micron);
  const d = num(density);
  return m > 0 && d > 0 ? m * d : 0;
}

/** How many square metres one kilo of this film yields. */
export function sqmPerKg(micron, density) {
  const g = gsm(micron, density);
  return g > 0 ? 1000 / g : 0;
}

/** Whatever unit the invoice used, the job needs a cost per square metre. */
export function filmCostPerSqm(film = {}) {
  const g = gsm(film.micron, film.density);
  if ((film.mode || "per_kg") === "per_sqm") return num(film.ratePerSqm);
  if (g <= 0) return 0;
  return (num(film.ratePerKg) * g) / 1000;
}

/** The same rate expressed per kilo, for checking against a supplier quote. */
export function filmCostPerKg(film = {}) {
  const g = gsm(film.micron, film.density);
  if ((film.mode || "per_kg") === "per_kg") return num(film.ratePerKg);
  if (g <= 0) return 0;
  return (num(film.ratePerSqm) * 1000) / g;
}

/**
 * Cost of the plates for one job.
 * `sets` is how many plate sets the layout needs — the multi-plate planner's
 * plate count — and each set carries one plate per colour.
 */
export function plateCost({ areaCm2, colours = 1, sets = 1, rates = DEFAULT_RATES }) {
  const area = Math.max(0, num(areaCm2));
  const perPlate = area * num(rates.plateRatePerCm2);
  const count = Math.max(0, Math.round(num(colours) || 1)) * Math.max(0, Math.round(num(sets) || 1));
  return {
    plateCount: count,
    areaCm2: area,
    costPerPlate: perPlate + num(rates.mountingPerPlate),
    total: (perPlate + num(rates.mountingPerPlate)) * count,
  };
}

/** Convert an area given in the working unit's squares into square metres. */
export function toSquareMetres(area, unit = "mm") {
  const a = num(area);
  switch (unit) {
    case "mm":
      return a / 1e6;
    case "cm":
      return a / 1e4;
    case "m":
      return a;
    case "in":
      return a * 0.00064516;
    case "ft":
      return a * 0.09290304;
    default:
      return a;
  }
}

/** Convert an area in the working unit's squares into square centimetres. */
export function toSquareCm(area, unit = "mm") {
  return toSquareMetres(area, unit) * 1e4;
}

/**
 * Full cost of a job: the plates once, the film for every metre run.
 *
 * `materialArea` is the web actually consumed, in the working unit squared —
 * exactly what the optimiser reports.
 */
export function jobCost({
  materialArea,
  unit = "mm",
  plateAreaCm2,
  colours = 1,
  sets = 1,
  quantity = 0,
  rates = DEFAULT_RATES,
}) {
  const plates = plateCost({ areaCm2: plateAreaCm2, colours, sets, rates });
  const sqm = toSquareMetres(materialArea, unit);
  const perSqm = filmCostPerSqm(rates.film);
  const material = sqm * perSqm;
  const qty = Math.max(0, Math.floor(num(quantity)));

  const total = plates.total + material;
  return {
    plates,
    materialSqm: sqm,
    materialCostPerSqm: perSqm,
    materialCost: material,
    total,
    quantity: qty,
    // Plates are a one-off; film recurs with every label. Keeping them apart is
    // what makes the break-even below meaningful.
    perThousand: qty > 0 ? (total / qty) * 1000 : 0,
    materialPerThousand: qty > 0 ? (material / qty) * 1000 : 0,
    platePerThousand: qty > 0 ? (plates.total / qty) * 1000 : 0,
  };
}

/**
 * Where a layout that costs more in plates but less in film overtakes one that
 * is cheaper to tool up. Returns the quantity at which they cost the same.
 *
 * A null break-even means one option is cheaper on both counts, so there is
 * nothing to trade off.
 */
export function breakEven(optionA, optionB) {
  const plateGap = optionB.plates.total - optionA.plates.total;
  const perLabelA = optionA.quantity > 0 ? optionA.materialCost / optionA.quantity : 0;
  const perLabelB = optionB.quantity > 0 ? optionB.materialCost / optionB.quantity : 0;
  const materialGap = perLabelA - perLabelB;

  if (plateGap <= 0 && materialGap >= 0) return { quantity: null, cheaper: "B", reason: "cheaper on both" };
  if (plateGap >= 0 && materialGap <= 0) return { quantity: null, cheaper: "A", reason: "cheaper on both" };

  const quantity = Math.ceil(plateGap / materialGap);
  return {
    quantity: quantity > 0 ? quantity : null,
    cheaper: quantity > 0 ? "depends" : "A",
    reason:
      quantity > 0
        ? `B costs ${Math.abs(plateGap).toFixed(0)} more in plates but ${Math.abs(materialGap).toFixed(4)} less per label`
        : "no crossover",
  };
}

export const formatMoney = (value, currency = "₹") =>
  `${currency}${Math.round(num(value)).toLocaleString("en-IN")}`;

export const formatPaise = (value, currency = "₹") => `${currency}${num(value).toFixed(2)}`;
