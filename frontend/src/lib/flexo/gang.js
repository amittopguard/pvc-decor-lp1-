/**
 * Gang run planning: several label SKUs sharing one web, one cylinder and one
 * plate set.
 *
 * The press runs until the slowest-filling SKU has met its quantity, so every
 * other SKU overruns. Choosing lane counts close to the ratio of the ordered
 * quantities is what keeps that overrun — and the material bill — down.
 */

import { aroundFit, cylinderTeeth, round } from "./layout";

const EPS = 1e-6;

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Best lane allocation for one web and one cylinder.
 * Depth-first over lane counts, pruned on width; the remaining SKUs always
 * need at least one lane each, which cuts the tree hard.
 */
function bestLanes(items, usable, gap, deadline) {
  const n = items.length;
  const lanes = new Array(n).fill(1);
  let best = null;
  let leaves = 0;

  // Width still needed if every remaining SKU takes a single lane.
  const tailMin = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) tailMin[i] = tailMin[i + 1] + items[i].w + gap;

  const evaluate = () => {
    leaves++;
    let revolutions = 0;
    for (let i = 0; i < n; i++) {
      const perRev = lanes[i] * items[i].around;
      revolutions = Math.max(revolutions, Math.ceil(items[i].qty / perRev));
    }
    let overrun = 0;
    let totalLanes = 0;
    for (let i = 0; i < n; i++) {
      overrun += revolutions * lanes[i] * items[i].around - items[i].qty;
      totalLanes += lanes[i];
    }
    if (
      !best ||
      revolutions < best.revolutions ||
      (revolutions === best.revolutions && overrun < best.overrun) ||
      (revolutions === best.revolutions && overrun === best.overrun && totalLanes < best.totalLanes)
    ) {
      best = { lanes: [...lanes], revolutions, overrun, totalLanes };
    }
  };

  const walk = (i, usedWidth) => {
    if (leaves > 400000 || Date.now() > deadline) return;
    if (i === n) {
      evaluate();
      return;
    }
    for (let k = 1; ; k++) {
      lanes[i] = k;
      const width = usedWidth + k * (items[i].w + gap);
      // Everything after this SKU still needs one lane apiece.
      if (width + tailMin[i + 1] - gap > usable + EPS) break;
      walk(i + 1, width);
      if (leaves > 400000 || Date.now() > deadline) break;
    }
    lanes[i] = 1;
  };

  walk(0, 0);
  return best;
}

/**
 * Rank gang plans across the candidate webs and cylinders.
 * `skus` need width, height and qty; each may allow rotation independently.
 */
export function solveGang({
  skus = [],
  webs = [],
  cylinders = {},
  gapAcross = 3,
  gapAround = 3,
  edgeMargin = 0,
  pitch = 3.175,
  timeBudgetMs = 4000,
  limit = 20,
} = {}) {
  const started = Date.now();
  const deadline = started + timeBudgetMs;

  const list = skus
    .filter((s) => s && s.enabled !== false && num(s.width) > 0 && num(s.height) > 0 && num(s.qty) > 0)
    .map((s, i) => ({
      id: s.id || `sku-${i}`,
      name: s.name || `SKU ${i + 1}`,
      w: num(s.width),
      h: num(s.height),
      qty: Math.floor(num(s.qty)),
      canRotate: s.canRotate !== false,
    }));

  const errors = [];
  if (list.length < 2) errors.push("Add at least two SKUs to plan a gang run.");
  if (list.length > 8) errors.push("Gang planning is limited to 8 SKUs at a time.");
  const webList = webs
    .filter((w) => w && w.enabled !== false && num(w.width) > 0)
    .map((w) => ({ width: num(w.width), label: w.label || `${round(num(w.width))}` }));
  if (!webList.length) errors.push("Enter at least one web width.");
  const teethList = cylinderTeeth(cylinders);
  if (!teethList.length) errors.push("Enter a cylinder range or a list of teeth counts.");
  if (errors.length) return { ok: false, errors, options: [], best: null };

  const gap = Math.max(0, num(gapAcross));
  const minGapAround = Math.max(0, num(gapAround));
  const margin = Math.max(0, num(edgeMargin));
  const toothPitch = num(pitch) > 0 ? num(pitch) : 3.175;

  // Every combination of per-SKU orientations.
  const orientationSets = [[]];
  for (const sku of list) {
    const next = [];
    for (const partial of orientationSets) {
      next.push([...partial, false]);
      if (sku.canRotate && Math.abs(sku.w - sku.h) > EPS) next.push([...partial, true]);
    }
    orientationSets.length = 0;
    orientationSets.push(...next);
  }

  const options = [];
  let combos = 0;

  outer: for (const web of webList) {
    const usable = web.width - 2 * margin;
    if (usable <= EPS) continue;

    for (const teeth of teethList) {
      const repeat = teeth * toothPitch;

      for (const flips of orientationSets) {
        if (Date.now() > deadline) break outer;
        combos++;

        const items = [];
        let viable = true;
        for (let i = 0; i < list.length; i++) {
          const sku = list[i];
          const w = flips[i] ? sku.h : sku.w;
          const h = flips[i] ? sku.w : sku.h;
          const fit = aroundFit(repeat, h, minGapAround);
          if (!fit || w + 2 * margin > web.width + EPS) {
            viable = false;
            break;
          }
          items.push({ w, h, around: fit.count, gapAround: fit.gap, qty: sku.qty, rotated: flips[i], sku });
        }
        if (!viable) continue;

        const result = bestLanes(items, usable, gap, deadline);
        if (!result) continue;

        const usedWidth =
          items.reduce((s, it, i) => s + result.lanes[i] * it.w, 0) + (result.totalLanes - 1) * gap;
        const revArea = web.width * repeat;
        const materialArea = result.revolutions * revArea;
        const labelArea = items.reduce((s, it, i) => s + result.lanes[i] * it.around * it.w * it.h, 0);

        options.push({
          id: `${web.label}|${teeth}|${flips.map((f) => (f ? "r" : "n")).join("")}`,
          webWidth: round(web.width),
          webLabel: web.label,
          teeth,
          repeat: round(repeat, 4),
          revolutions: result.revolutions,
          webLength: round(result.revolutions * repeat, 2),
          materialArea,
          totalOverrun: result.overrun,
          totalLanes: result.totalLanes,
          usedWidth: round(usedWidth, 3),
          edgeWaste: round(web.width - usedWidth, 3),
          utilisation: labelArea / revArea,
          lanes: items.map((it, i) => {
            const perRev = result.lanes[i] * it.around;
            const printed = result.revolutions * perRev;
            return {
              id: it.sku.id,
              name: it.sku.name,
              lanes: result.lanes[i],
              around: it.around,
              perRev,
              rotated: it.rotated,
              width: round(it.w),
              height: round(it.h),
              gapAround: round(it.gapAround, 4),
              ordered: it.qty,
              printed,
              overrun: printed - it.qty,
              overrunPct: it.qty > 0 ? (printed - it.qty) / it.qty : 0,
            };
          }),
        });
      }
    }
  }

  if (!options.length) {
    return {
      ok: false,
      errors: ["No gang layout fits. Try a wider web, a larger cylinder, or fewer SKUs per run."],
      options: [],
      best: null,
    };
  }

  // Least material first, then least overrun, then the simpler plate set.
  options.sort(
    (a, b) =>
      a.materialArea - b.materialArea ||
      a.totalOverrun - b.totalOverrun ||
      a.totalLanes - b.totalLanes ||
      a.teeth - b.teeth
  );

  return {
    ok: true,
    errors: [],
    options: options.slice(0, limit),
    best: options[0],
    combos,
    elapsedMs: Date.now() - started,
  };
}
