/**
 * Guillotine cutting-stock optimizer (2D bin packing).
 *
 * Convention: `length` runs along the X axis, `width` along the Y axis.
 * Grain direction runs along the length, so a part with a fixed grain may
 * not be rotated by 90 degrees.
 *
 * Every cut produced by this packer is a full edge-to-edge guillotine cut of
 * the piece it is applied to, which is what a panel saw can actually do.
 */

const EPS = 1e-6;

export const SORT_ORDERS = [
  "area-desc",
  "maxside-desc",
  "length-desc",
  "width-desc",
  "perimeter-desc",
];

export const FIT_RULES = ["area", "short", "long", "topleft", "worst-area"];

export const SPLIT_RULES = ["shorter", "longer", "max-area", "min-area"];

export const STRATEGIES = ["global", "sequential"];

export const DEFAULT_SETTINGS = {
  unit: "mm",
  kerf: 3,
  considerGrain: false,
  trim: 0,
  objective: "sheets", // "sheets" | "cuts"
  effort: "balanced", // "fast" | "balanced" | "thorough"
  timeBudgetMs: 4000,
};

// Deterministic heuristic combinations, then seeded random restarts on top.
const EFFORT = {
  fast: { deterministic: 20, random: 0 },
  balanced: { deterministic: 120, random: 60 },
  thorough: { deterministic: 120, random: 400 },
};

/** Small deterministic PRNG so a given project always solves the same way. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export const round = (v, d = 3) => {
  const f = Math.pow(10, d);
  return Math.round((v + Number.EPSILON) * f) / f;
};

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const sortValue = (order, l, w) => {
  switch (order) {
    case "maxside-desc":
      return Math.max(l, w) * 1e6 + Math.min(l, w);
    case "length-desc":
      return l * 1e6 + w;
    case "width-desc":
      return w * 1e6 + l;
    case "perimeter-desc":
      return (l + w) * 1e6 + Math.max(l, w);
    case "area-desc":
    default:
      return l * w * 1e3 + Math.max(l, w);
  }
};

/* ------------------------------------------------------------------ */
/* input normalisation                                                 */
/* ------------------------------------------------------------------ */

/** Expand the part rows into one instance per required piece. */
function expandParts(parts, settings) {
  const out = [];
  (parts || []).forEach((p, rowIndex) => {
    if (p.enabled === false) return;
    const length = num(p.length);
    const width = num(p.width);
    const qty = Math.max(0, Math.floor(num(p.qty)));
    if (length <= 0 || width <= 0 || qty === 0) return;
    // A part may rotate unless its row pins the grain direction. The project
    // level "respect grain" switch sets this flag on every row at once.
    const canRotate = p.canRotate !== false;
    for (let i = 0; i < qty; i++) {
      out.push({
        uid: `${p.id ?? rowIndex}#${i}`,
        rowId: p.id ?? `row-${rowIndex}`,
        rowIndex,
        label: p.label || `${round(length)}x${round(width)}`,
        material: (p.material || "").trim(),
        length,
        width,
        canRotate,
        area: length * width,
      });
    }
  });
  return out;
}

/** Expand the stock rows into a pool of available sheets. */
function expandStock(stock) {
  const out = [];
  (stock || []).forEach((s, rowIndex) => {
    if (s.enabled === false) return;
    const length = num(s.length);
    const width = num(s.width);
    if (length <= 0 || width <= 0) return;
    const rawQty = num(s.qty);
    const qty = rawQty <= 0 ? Infinity : Math.floor(rawQty);
    out.push({
      rowId: s.id ?? `stock-${rowIndex}`,
      rowIndex,
      label: s.label || `${round(length)}x${round(width)}`,
      material: (s.material || "").trim(),
      length,
      width,
      qty,
      area: length * width,
    });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* single sheet packing                                                */
/* ------------------------------------------------------------------ */

function fitScore(rule, free, pw, ph) {
  const leftW = free.w - pw;
  const leftH = free.h - ph;
  switch (rule) {
    case "short":
      return Math.min(leftW, leftH);
    case "long":
      return Math.max(leftW, leftH);
    case "topleft":
      return free.y * 1e6 + free.x;
    case "worst-area":
      return -(free.w * free.h - pw * ph);
    case "area":
    default:
      return free.w * free.h - pw * ph;
  }
}

/**
 * Decide whether the first guillotine cut through `free` runs vertically
 * (through the full height) or horizontally (through the full width).
 */
function splitVertical(rule, free, pw, ph, kerf) {
  const leftW = free.w - pw - kerf; // usable strip to the right
  const leftH = free.h - ph - kerf; // usable strip below
  switch (rule) {
    case "longer":
      return leftW >= leftH;
    case "max-area": {
      const vert = Math.max(leftW * free.h, pw * leftH);
      const horiz = Math.max(free.w * leftH, leftW * ph);
      return vert >= horiz;
    }
    case "min-area": {
      const vert = Math.max(leftW * free.h, pw * leftH);
      const horiz = Math.max(free.w * leftH, leftW * ph);
      return vert < horiz;
    }
    case "shorter":
    default:
      return leftW < leftH;
  }
}

/**
 * Pack as many of `instances` as possible onto one sheet.
 * Returns the placements, the guillotine cut sequence and the leftover space.
 */
function packSheet(sheet, instances, opts) {
  const { kerf, trim, fitRule, splitRule, strategy, sortOrder, noise } = opts;

  const usableW = sheet.length - 2 * trim;
  const usableH = sheet.width - 2 * trim;
  const placements = [];
  const cuts = [];
  const used = new Set();

  if (usableW <= EPS || usableH <= EPS) {
    return { placements, cuts, free: [], usedArea: 0, placedIds: used };
  }

  const free = [{ x: trim, y: trim, w: usableW, h: usableH }];

  if (trim > EPS) {
    cuts.push({ dir: "v", pos: trim, from: 0, to: sheet.width, length: sheet.width, trim: true });
    cuts.push({ dir: "v", pos: sheet.length - trim, from: 0, to: sheet.width, length: sheet.width, trim: true });
    cuts.push({ dir: "h", pos: trim, from: 0, to: sheet.length, length: sheet.length, trim: true });
    cuts.push({ dir: "h", pos: sheet.width - trim, from: 0, to: sheet.length, length: sheet.length, trim: true });
  }

  const pool = instances.filter((p) => !p.material || !sheet.material || p.material === sheet.material);
  // `noise` shuffles the ordering slightly on random restart passes so the
  // search escapes the one layout every deterministic rule agrees on.
  const rank = (p) => sortValue(sortOrder, p.length, p.width) * (noise ? 1 + noise.get(p.rowId) : 1);
  const ordered = strategy === "sequential" ? [...pool].sort((a, b) => rank(b) - rank(a)) : pool;

  const place = (inst, rect, pw, ph, rotated) => {
    placements.push({
      uid: inst.uid,
      rowId: inst.rowId,
      rowIndex: inst.rowIndex,
      label: inst.label,
      material: inst.material,
      x: rect.x,
      y: rect.y,
      w: pw,
      h: ph,
      rotated,
      refLength: inst.length,
      refWidth: inst.width,
    });
    used.add(inst.uid);

    const idx = free.indexOf(rect);
    if (idx >= 0) free.splice(idx, 1);

    const restW = rect.w - pw; // material to the right, kerf included
    const restH = rect.h - ph; // material below, kerf included

    if (splitVertical(splitRule, rect, pw, ph, kerf)) {
      // full-height cut at x = rect.x + pw, then a cut across the left column
      if (restW > EPS) {
        cuts.push({
          dir: "v",
          pos: rect.x + pw,
          from: rect.y,
          to: rect.y + rect.h,
          length: rect.h,
        });
        const w = restW - kerf;
        if (w > EPS) free.push({ x: rect.x + pw + kerf, y: rect.y, w, h: rect.h });
      }
      if (restH > EPS) {
        cuts.push({
          dir: "h",
          pos: rect.y + ph,
          from: rect.x,
          to: rect.x + pw,
          length: pw,
        });
        const h = restH - kerf;
        if (h > EPS) free.push({ x: rect.x, y: rect.y + ph + kerf, w: pw, h });
      }
    } else {
      // full-width cut at y = rect.y + ph, then a cut down the top strip
      if (restH > EPS) {
        cuts.push({
          dir: "h",
          pos: rect.y + ph,
          from: rect.x,
          to: rect.x + rect.w,
          length: rect.w,
        });
        const h = restH - kerf;
        if (h > EPS) free.push({ x: rect.x, y: rect.y + ph + kerf, w: rect.w, h });
      }
      if (restW > EPS) {
        cuts.push({
          dir: "v",
          pos: rect.x + pw,
          from: rect.y,
          to: rect.y + ph,
          length: ph,
        });
        const w = restW - kerf;
        if (w > EPS) free.push({ x: rect.x + pw + kerf, y: rect.y, w, h: ph });
      }
    }
  };

  const candidatesFor = (inst) => {
    const opts2 = [[inst.length, inst.width, false]];
    if (inst.canRotate && Math.abs(inst.length - inst.width) > EPS) {
      opts2.push([inst.width, inst.length, true]);
    }
    return opts2;
  };

  if (strategy === "sequential") {
    for (const inst of ordered) {
      if (used.has(inst.uid)) continue;
      let best = null;
      for (const rect of free) {
        for (const [pw, ph, rotated] of candidatesFor(inst)) {
          if (pw > rect.w + EPS || ph > rect.h + EPS) continue;
          const score = fitScore(fitRule, rect, pw, ph);
          if (!best || score < best.score - EPS) best = { score, rect, pw, ph, rotated };
        }
      }
      if (best) place(inst, best.rect, best.pw, best.ph, best.rotated);
    }
  } else {
    // Repeatedly commit the single best (part, free rect) pair available.
    for (;;) {
      let best = null;
      for (const inst of ordered) {
        if (used.has(inst.uid)) continue;
        for (const rect of free) {
          for (const [pw, ph, rotated] of candidatesFor(inst)) {
            if (pw > rect.w + EPS || ph > rect.h + EPS) continue;
            const score = fitScore(fitRule, rect, pw, ph);
            const tie = -inst.area;
            if (!best || score < best.score - EPS || (Math.abs(score - best.score) <= EPS && tie < best.tie)) {
              best = { score, tie, inst, rect, pw, ph, rotated };
            }
          }
        }
      }
      if (!best) break;
      place(best.inst, best.rect, best.pw, best.ph, best.rotated);
    }
  }

  const usedArea = placements.reduce((s, p) => s + p.w * p.h, 0);
  return { placements, cuts, free, usedArea, placedIds: used };
}

/* ------------------------------------------------------------------ */
/* full run: fill sheets until every part is placed                    */
/* ------------------------------------------------------------------ */

function runPass(instances, stockPool, opts) {
  const remaining = new Map(instances.map((p) => [p.uid, p]));
  const pool = stockPool.map((s) => ({ ...s }));
  const sheets = [];
  let guard = instances.length + 50;

  while (remaining.size > 0 && guard-- > 0) {
    const parts = [...remaining.values()];
    let choice = null;

    for (const stock of pool) {
      if (stock.qty <= 0) continue;
      const res = packSheet(stock, parts, opts);
      if (res.placements.length === 0) continue;
      const utilisation = res.usedArea / (stock.area || 1);
      // Prefer the sheet that wastes the least; break ties towards the
      // smaller sheet so large boards stay whole for later.
      const better =
        !choice ||
        utilisation > choice.utilisation + 1e-4 ||
        (Math.abs(utilisation - choice.utilisation) <= 1e-4 && stock.area < choice.stock.area);
      if (better) choice = { stock, res, utilisation };
    }

    if (!choice) break; // nothing left that fits anywhere

    choice.res.placements.forEach((p) => remaining.delete(p.uid));
    choice.stock.qty -= 1;
    sheets.push({
      stockRowId: choice.stock.rowId,
      label: choice.stock.label,
      material: choice.stock.material,
      length: choice.stock.length,
      width: choice.stock.width,
      area: choice.stock.area,
      placements: choice.res.placements,
      cuts: choice.res.cuts,
      free: choice.res.free,
      usedArea: choice.res.usedArea,
    });
  }

  return { sheets, unplaced: [...remaining.values()] };
}

function scoreSolution(sol, objective) {
  const sheetCount = sol.sheets.length;
  const stockArea = sol.sheets.reduce((s, sh) => s + sh.area, 0);
  const usedArea = sol.sheets.reduce((s, sh) => s + sh.usedArea, 0);
  const cuts = sol.sheets.reduce((s, sh) => s + sh.cuts.filter((c) => !c.trim).length, 0);
  const cutLength = sol.sheets.reduce(
    (s, sh) => s + sh.cuts.reduce((t, c) => t + (c.trim ? 0 : c.length), 0),
    0
  );
  // Largest single offcut left on the last sheet — a big remnant is reusable,
  // the same area spread over slivers is not.
  const lastSheet = sol.sheets[sol.sheets.length - 1];
  const bestOffcut = lastSheet ? lastSheet.free.reduce((m, f) => Math.max(m, f.w * f.h), 0) : 0;

  return {
    unplaced: sol.unplaced.length,
    sheetCount,
    stockArea,
    usedArea,
    cuts,
    cutLength,
    bestOffcut,
    key: [
      sol.unplaced.length,
      objective === "cuts" ? cuts : 0,
      stockArea,
      sheetCount,
      objective === "cuts" ? cutLength : -bestOffcut,
      objective === "cuts" ? -bestOffcut : cutLength,
    ],
  };
}

function betterKey(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - 1e-9) return true;
    if (a[i] > b[i] + 1e-9) return false;
  }
  return false;
}

/**
 * Every combination of strategy, fit rule, split rule and sort order, ordered
 * so that a truncated list still spans the whole search space rather than
 * exhausting one corner of it.
 */
function buildPassList(limit) {
  const list = [];
  for (const splitRule of SPLIT_RULES) {
    for (const fitRule of FIT_RULES) {
      for (const strategy of STRATEGIES) {
        if (strategy === "global") {
          list.push({ strategy, fitRule, splitRule, sortOrder: "area-desc" });
        } else {
          for (const sortOrder of SORT_ORDERS) list.push({ strategy, fitRule, splitRule, sortOrder });
        }
      }
    }
  }
  return list.slice(0, limit);
}

/** Random restarts reuse the deterministic rules but jitter the part order. */
function buildRandomPass(rand) {
  return {
    strategy: "sequential",
    fitRule: FIT_RULES[Math.floor(rand() * FIT_RULES.length)],
    splitRule: SPLIT_RULES[Math.floor(rand() * SPLIT_RULES.length)],
    sortOrder: SORT_ORDERS[Math.floor(rand() * SORT_ORDERS.length)],
    jitter: 0.15 + rand() * 0.5,
  };
}

/* ------------------------------------------------------------------ */
/* public entry point                                                  */
/* ------------------------------------------------------------------ */

export function optimize({ parts, stock, settings } = {}) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const started = Date.now();

  const instances = expandParts(parts, cfg);
  const stockPool = expandStock(stock);

  if (instances.length === 0) {
    return emptyResult(cfg, "Add at least one part with a length, a width and a quantity.");
  }
  if (stockPool.length === 0) {
    return emptyResult(cfg, "Add at least one stock sheet with a length and a width.");
  }

  const kerf = Math.max(0, num(cfg.kerf));
  const trim = Math.max(0, num(cfg.trim));

  // Parts that can never fit on any sheet are reported instead of looping.
  const impossible = [];
  const fittable = instances.filter((p) => {
    const ok = stockPool.some((s) => {
      const uw = s.length - 2 * trim;
      const uh = s.width - 2 * trim;
      if (s.material && p.material && s.material !== p.material) return false;
      const straight = p.length <= uw + EPS && p.width <= uh + EPS;
      const turned = p.canRotate && p.width <= uw + EPS && p.length <= uh + EPS;
      return straight || turned;
    });
    if (!ok) impossible.push(p);
    return ok;
  });

  let best = null;
  let bestScore = null;
  let passesRun = 0;

  const budget = EFFORT[cfg.effort] || EFFORT.balanced;
  const rand = mulberry32(0x5eed);
  const rowIds = [...new Set(fittable.map((p) => p.rowId))];

  const tryPass = (pass) => {
    let noise = null;
    if (pass.jitter) {
      noise = new Map();
      rowIds.forEach((id) => noise.set(id, (rand() - 0.5) * pass.jitter));
    }
    const sol = runPass(fittable, stockPool, { ...pass, noise, kerf, trim });
    const score = scoreSolution(sol, cfg.objective);
    passesRun++;
    if (!best || betterKey(score.key, bestScore.key)) {
      best = sol;
      bestScore = score;
    }
    return Date.now() - started <= cfg.timeBudgetMs;
  };

  for (const pass of buildPassList(budget.deterministic)) {
    if (!tryPass(pass)) break;
  }
  for (let i = 0; i < budget.random; i++) {
    if (!tryPass(buildRandomPass(rand))) break;
  }

  return buildResult(best, bestScore, impossible, cfg, kerf, trim, Date.now() - started, passesRun);
}

function emptyResult(cfg, error) {
  return {
    ok: false,
    error,
    settings: cfg,
    sheets: [],
    unplaced: [],
    summary: {
      sheetCount: 0,
      usedArea: 0,
      stockArea: 0,
      wasteArea: 0,
      utilisation: 0,
      cuts: 0,
      cutLength: 0,
      partCount: 0,
      placedCount: 0,
      byStock: [],
      byPart: [],
    },
    elapsedMs: 0,
    passes: 0,
  };
}

function buildResult(sol, score, impossible, cfg, kerf, trim, elapsedMs, passes) {
  const sheets = sol.sheets.map((sh, i) => {
    const cuts = sh.cuts
      .filter((c) => !c.trim)
      .sort((a, b) => (a.dir === b.dir ? a.pos - b.pos : a.dir === "v" ? -1 : 1));
    const offcuts = sh.free
      .filter((f) => f.w > EPS && f.h > EPS)
      .map((f) => ({ x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h), area: f.w * f.h }))
      .sort((a, b) => b.area - a.area);
    return {
      id: `sheet-${i + 1}`,
      index: i + 1,
      stockRowId: sh.stockRowId,
      label: sh.label,
      material: sh.material,
      length: round(sh.length),
      width: round(sh.width),
      area: sh.area,
      usedArea: sh.usedArea,
      wasteArea: sh.area - sh.usedArea,
      utilisation: sh.area > 0 ? sh.usedArea / sh.area : 0,
      placements: sh.placements.map((p) => ({
        ...p,
        x: round(p.x),
        y: round(p.y),
        w: round(p.w),
        h: round(p.h),
      })),
      cuts: sh.cuts.filter((c) => !c.trim).map((c) => ({ ...c, pos: round(c.pos), length: round(c.length) })),
      cutCount: cuts.length,
      cutLength: cuts.reduce((s, c) => s + c.length, 0),
      offcuts,
      largestOffcut: offcuts[0] || null,
    };
  });

  const byStockMap = new Map();
  sheets.forEach((sh) => {
    const key = sh.stockRowId;
    const entry = byStockMap.get(key) || {
      rowId: key,
      label: sh.label,
      length: sh.length,
      width: sh.width,
      material: sh.material,
      count: 0,
    };
    entry.count += 1;
    byStockMap.set(key, entry);
  });

  const byPartMap = new Map();
  sheets.forEach((sh) =>
    sh.placements.forEach((p) => {
      const key = `${p.rowId}`;
      const entry = byPartMap.get(key) || {
        rowId: p.rowId,
        label: p.label,
        length: round(p.refLength),
        width: round(p.refWidth),
        placed: 0,
        rotated: 0,
      };
      entry.placed += 1;
      if (p.rotated) entry.rotated += 1;
      byPartMap.set(key, entry);
    })
  );

  const unplaced = [...sol.unplaced, ...impossible];
  const unplacedGrouped = [];
  const seen = new Map();
  unplaced.forEach((p) => {
    const key = `${p.rowId}|${p.length}x${p.width}`;
    if (!seen.has(key)) {
      const row = {
        rowId: p.rowId,
        label: p.label,
        length: round(p.length),
        width: round(p.width),
        qty: 0,
      };
      seen.set(key, row);
      unplacedGrouped.push(row);
    }
    seen.get(key).qty += 1;
  });

  const stockArea = sheets.reduce((s, sh) => s + sh.area, 0);
  const usedArea = sheets.reduce((s, sh) => s + sh.usedArea, 0);
  const placedCount = sheets.reduce((s, sh) => s + sh.placements.length, 0);

  return {
    ok: true,
    error: unplacedGrouped.length ? "Some parts could not be placed on the available stock." : null,
    settings: { ...cfg, kerf, trim },
    sheets,
    unplaced: unplacedGrouped,
    summary: {
      sheetCount: sheets.length,
      usedArea,
      stockArea,
      wasteArea: stockArea - usedArea,
      utilisation: stockArea > 0 ? usedArea / stockArea : 0,
      cuts: sheets.reduce((s, sh) => s + sh.cutCount, 0),
      cutLength: sheets.reduce((s, sh) => s + sh.cutLength, 0),
      partCount: placedCount + unplaced.length,
      placedCount,
      byStock: [...byStockMap.values()],
      byPart: [...byPartMap.values()],
    },
    elapsedMs,
    passes,
    score,
  };
}

/* ------------------------------------------------------------------ */
/* validation used by the UI                                           */
/* ------------------------------------------------------------------ */

export function validate({ parts, stock, settings }) {
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const errors = [];
  const activeParts = (parts || []).filter((p) => p.enabled !== false && num(p.length) > 0 && num(p.width) > 0 && num(p.qty) > 0);
  const activeStock = (stock || []).filter((s) => s.enabled !== false && num(s.length) > 0 && num(s.width) > 0);
  if (!activeParts.length) errors.push("Add at least one part with a length, a width and a quantity.");
  if (!activeStock.length) errors.push("Add at least one stock sheet with a length and a width.");
  if (num(cfg.kerf) < 0) errors.push("Cut width cannot be negative.");
  if (num(cfg.trim) < 0) errors.push("Edge trim cannot be negative.");
  return errors;
}
