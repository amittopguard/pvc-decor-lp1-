/**
 * Splitting a job across several plate sets.
 *
 * A gang run is limited by the press width: every SKU on a plate needs at
 * least one lane, so once the narrowest possible layout of all of them is
 * wider than the press, the job simply cannot run as one plate. This module
 * partitions the SKUs into as few plates as will fit, then solves each plate
 * as its own gang run.
 */

import { solveGang } from "./gang";
import { round } from "./layout";

const EPS = 1e-6;

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** The narrowest this SKU can be laid out, allowing for rotation. */
const narrowestWidth = (sku) =>
  sku.canRotate !== false ? Math.min(num(sku.width), num(sku.height)) : num(sku.width);

/** Width a group needs at one lane each — the test for "can this be one plate". */
export function minimumWidth(group, gutter, margin) {
  if (!group.length) return 0;
  const lanes = group.reduce((s, sku) => s + narrowestWidth(sku), 0);
  return lanes + (group.length - 1) * gutter + 2 * margin;
}

/** Greedily fill plates in the given order, opening a new one when full. */
function greedyPartition(order, capacityWidth, gutter, margin, maxPerPlate) {
  const groups = [];
  let current = [];
  for (const sku of order) {
    const candidate = [...current, sku];
    const fits = minimumWidth(candidate, gutter, margin) <= capacityWidth + EPS;
    if (current.length && (!fits || candidate.length > maxPerPlate)) {
      groups.push(current);
      current = [sku];
    } else {
      current = candidate;
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

/** Deal the SKUs round-robin into k plates, which evens out the widths. */
function balancedPartition(order, k, capacityWidth, gutter, margin, maxPerPlate) {
  const groups = Array.from({ length: k }, () => []);
  order.forEach((sku, i) => groups[i % k].push(sku));
  const ok = groups.every(
    (g) => g.length > 0 && g.length <= maxPerPlate && minimumWidth(g, gutter, margin) <= capacityWidth + EPS
  );
  return ok ? groups : null;
}

const key = (groups) =>
  groups
    .map((g) => g.map((s) => s.id).sort().join(","))
    .sort()
    .join("|");

/**
 * Plan the whole job, using as few plates as will fit.
 * Every option accepted by solveGang is accepted here and passed through.
 */
export function solvePlateSets({
  skus = [],
  webs = [],
  webRange = null,
  cylinders = {},
  gapAcross = 3,
  gapAround = 3,
  edgeMargin = 0,
  pitch = 3.175,
  plateTolerance,
  maxSkusPerPlate = 8,
  cost = null,
  timeBudgetMs = 8000,
} = {}) {
  const started = Date.now();
  const deadline = started + timeBudgetMs;

  const list = (skus || []).filter(
    (s) => s && s.enabled !== false && num(s.width) > 0 && num(s.height) > 0 && num(s.qty) > 0
  );

  const errors = [];
  if (!list.length) errors.push("Add at least one SKU with a size and a quantity.");

  const gutter = Math.max(0, num(gapAcross));
  const margin = Math.max(0, num(edgeMargin));

  const useRange = !!webRange && num(webRange.max) > 0;
  const widest = useRange
    ? num(webRange.max)
    : Math.max(0, ...webs.filter((w) => w && w.enabled !== false).map((w) => num(w.width)));
  if (!widest) errors.push("Set a print width range, or at least one stocked web width.");
  if (errors.length) return { ok: false, errors, plates: [], totals: null };

  // A SKU wider than the press on its own can never be placed.
  const tooWide = list.filter((s) => narrowestWidth(s) + 2 * margin > widest + EPS);
  if (tooWide.length) {
    return {
      ok: false,
      errors: [
        `${tooWide.map((s) => s.name || "A SKU").join(", ")} ${tooWide.length === 1 ? "is" : "are"} wider than the press can print, even alone.`,
      ],
      plates: [],
      totals: null,
    };
  }

  const gangArgs = {
    webs,
    webRange,
    cylinders,
    gapAcross,
    gapAround,
    edgeMargin,
    pitch,
    plateTolerance,
    minSkus: 1,
  };

  // Several orders, because which SKUs end up sharing a plate is the whole game.
  const orders = [
    { name: "as entered", list: [...list] },
    { name: "widest first", list: [...list].sort((a, b) => narrowestWidth(b) - narrowestWidth(a)) },
    { name: "narrowest first", list: [...list].sort((a, b) => narrowestWidth(a) - narrowestWidth(b)) },
    { name: "largest order first", list: [...list].sort((a, b) => num(b.qty) - num(a.qty)) },
    { name: "grouped by height", list: [...list].sort((a, b) => num(a.height) - num(b.height)) },
  ];

  const partitions = [];
  const seen = new Set();
  const addPartition = (groups, name) => {
    if (!groups || !groups.length) return;
    const k = key(groups);
    if (seen.has(k)) return;
    seen.add(k);
    partitions.push({ groups, strategy: name });
  };

  for (const order of orders) {
    const greedy = greedyPartition(order.list, widest, gutter, margin, maxSkusPerPlate);
    addPartition(greedy, order.name);
    // Spreading the same SKUs over one more plate often cuts the overrun.
    for (let k = greedy.length; k <= greedy.length + 1; k++) {
      if (k < 1 || k > list.length) continue;
      addPartition(balancedPartition(order.list, k, widest, gutter, margin, maxSkusPerPlate), `${order.name}, ${k} plates`);
    }
  }

  const evaluated = [];
  for (const partition of partitions) {
    if (Date.now() > deadline && evaluated.length) break;

    const solved = [];
    let viable = true;
    for (const group of partition.groups) {
      const res = solveGang({ ...gangArgs, skus: group, timeBudgetMs: 2000 });
      if (!res.ok || !res.best) {
        viable = false;
        break;
      }
      solved.push(res);
    }
    if (!viable) continue;

    const materialArea = solved.reduce((s, r) => s + r.best.materialArea, 0);
    const overrun = solved.reduce((s, r) => s + r.best.totalOverrun, 0);
    const webLength = solved.reduce((s, r) => s + r.best.webLength, 0);
    evaluated.push({ partition, solved, materialArea, overrun, webLength, plates: solved.length });
  }

  if (!evaluated.length) {
    return {
      ok: false,
      errors: ["No plate layout fits. Try a wider press width, a larger cylinder, or smaller labels."],
      plates: [],
      totals: null,
    };
  }

  const ordered = list.reduce((s, x) => s + Math.floor(num(x.qty)), 0);

  // With rates in hand the choice is a money one. Splitting the job over one
  // more plate nearly always saves film — every plate is sized to its own
  // group — but it buys a whole extra set of plates, one per colour, and that
  // is usually the larger number. Counting plates alone gets the same answer
  // only by accident.
  let rankedBy = "plates";
  if (typeof cost === "function") {
    for (const e of evaluated) {
      const priced = e.solved.map((r) => cost(r.best) || {});
      e.plateCost = priced.reduce((s, p) => s + (p.plateCost || 0), 0);
      e.materialCost = priced.reduce((s, p) => s + (p.materialCost || 0), 0);
      e.totalCost = e.plateCost + e.materialCost;
      e.costPerThousand = ordered > 0 ? (e.totalCost / ordered) * 1000 : 0;
    }
    if (evaluated.every((e) => Number.isFinite(e.totalCost) && e.totalCost > 0)) rankedBy = "cost";
  }

  if (rankedBy === "cost") {
    evaluated.sort((a, b) => a.totalCost - b.totalCost || a.plates - b.plates || a.overrun - b.overrun);
  } else {
    // Without rates, each plate still costs a plate and a setup, so fewest
    // plates leads and material then overrun break the tie.
    evaluated.sort(
      (a, b) => a.plates - b.plates || a.materialArea - b.materialArea || a.overrun - b.overrun
    );
  }
  const winner = evaluated[0];
  const printed = winner.solved.reduce(
    (s, r) => s + r.best.lanes.reduce((t, l) => t + l.printed, 0),
    0
  );

  const platePrice = rankedBy === "cost" ? winner.solved.map((r) => cost(r.best) || {}) : null;

  return {
    ok: true,
    errors: [],
    rankedBy,
    strategy: winner.partition.strategy,
    plates: winner.solved.map((res, i) => ({
      index: i + 1,
      plan: res.best,
      options: res.options,
      skuCount: res.best.lanes.length,
      cost: platePrice ? platePrice[i] : null,
    })),
    totals: {
      plates: winner.plates,
      skus: list.length,
      ordered,
      printed,
      overrun: winner.overrun,
      overrunPct: ordered > 0 ? winner.overrun / ordered : 0,
      materialArea: winner.materialArea,
      webLength: round(winner.webLength, 2),
      revolutions: winner.solved.reduce((s, r) => s + r.best.revolutions, 0),
      plateCost: winner.plateCost ?? null,
      materialCost: winner.materialCost ?? null,
      totalCost: winner.totalCost ?? null,
      costPerThousand: winner.costPerThousand ?? null,
    },
    alternatives: evaluated.slice(0, 8).map((e) => ({
      plates: e.plates,
      strategy: e.partition.strategy,
      materialArea: e.materialArea,
      overrun: e.overrun,
      plateCost: e.plateCost ?? null,
      materialCost: e.materialCost ?? null,
      totalCost: e.totalCost ?? null,
      costPerThousand: e.costPerThousand ?? null,
      groups: e.partition.groups.map((g) => g.map((s) => s.name || s.id)),
    })),
    elapsedMs: Date.now() - started,
  };
}
