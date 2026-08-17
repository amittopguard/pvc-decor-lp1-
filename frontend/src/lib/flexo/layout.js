/**
 * Flexo step-and-repeat layout.
 *
 * The printing cylinder turns continuously, so the down-web (around) direction
 * has no leftover: whatever repeat is not taken by labels is shared out into
 * the gaps between rows. The cross-web (across) direction is different — width
 * the labels do not use is edge trim, and you buy it on every metre of web.
 *
 * That asymmetry is why the ranking metric here is material per label rather
 * than labels per revolution.
 */

const EPS = 1e-6;

/** Gear pitches in millimetres. 1/8 in is the narrow-web standard. */
export const PITCHES = [
  { id: "eighth", label: '1/8 in (3.175 mm)', mm: 3.175 },
  { id: "metric5", label: "5 mm metric gear", mm: 5 },
  { id: "threeSixteenth", label: '3/16 in (4.7625 mm)', mm: 4.7625 },
  { id: "quarter", label: '1/4 in (6.35 mm)', mm: 6.35 },
];

export const getPitch = (id) => PITCHES.find((p) => p.id === id) || PITCHES[0];

export const DEFAULT_FLEXO = {
  unit: "mm",
  pitchId: "eighth",
  minTeeth: 60,
  maxTeeth: 200,
  gapAcross: 3,
  gapAround: 3,
  edgeMargin: 5,
  distributeAcross: false,
  minWidth: 320,
  maxWidth: 650,
  plateTolerance: 0.005,
};

/**
 * Layouts whose material cost is within this fraction of each other count as
 * equal, and the smaller cylinder wins — a smaller plate is the cheaper plate.
 */
export const DEFAULT_PLATE_TOLERANCE = 0.005;

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const round = (v, d = 3) => {
  const f = Math.pow(10, d);
  return Math.round((v + Number.EPSILON) * f) / f;
};

/** Teeth counts to evaluate, from an explicit list or a min–max range. */
export function cylinderTeeth({ teeth, minTeeth, maxTeeth }) {
  if (Array.isArray(teeth) && teeth.length) {
    return [...new Set(teeth.map((t) => Math.floor(num(t))).filter((t) => t > 0))].sort((a, b) => a - b);
  }
  const lo = Math.max(1, Math.floor(num(minTeeth) || 60));
  const hi = Math.max(lo, Math.floor(num(maxTeeth) || 200));
  const out = [];
  for (let t = lo; t <= hi; t++) out.push(t);
  return out;
}

/**
 * How many rows fit around a repeat, and the gap that results.
 * The gap grows to absorb the remainder, so it is never below the minimum.
 */
export function aroundFit(repeat, labelHeight, minGap) {
  if (labelHeight <= 0) return null;
  const count = Math.floor((repeat + EPS) / (labelHeight + minGap));
  if (count < 1) return null;
  const gap = repeat / count - labelHeight;
  return { count, gap };
}

/**
 * How many lanes fit across the usable web width.
 * Leftover width is edge trim unless the caller asks to widen the gutters.
 */
export function acrossFit(usableWidth, labelWidth, minGap, distribute) {
  if (labelWidth <= 0) return null;
  const count = Math.floor((usableWidth + minGap + EPS) / (labelWidth + minGap));
  if (count < 1) return null;
  const used = count * labelWidth + (count - 1) * minGap;
  const leftover = usableWidth - used;
  if (distribute && count > 1) {
    return { count, gap: (usableWidth - count * labelWidth) / (count - 1), leftover: 0 };
  }
  return { count, gap: minGap, leftover };
}

/**
 * Lane counts that can be run when the web may be slit to any width between
 * `min` and `max`. The web width becomes an output: slit to exactly what the
 * lanes need, except that anything under the minimum print width still costs
 * the minimum print width.
 */
export function widthOptions(minWidth, maxWidth, labelWidth, gutter, margin, distribute) {
  const out = [];
  if (labelWidth <= 0 || maxWidth <= 0) return out;
  const maxUsable = maxWidth - 2 * margin;
  const maxLanes = Math.floor((maxUsable + gutter + EPS) / (labelWidth + gutter));

  for (let count = 1; count <= maxLanes; count++) {
    const block = count * labelWidth + (count - 1) * gutter;
    const required = block + 2 * margin;
    // Narrower than the press can print still runs — and still gets paid for.
    const webWidth = Math.max(minWidth, required);
    if (webWidth > maxWidth + EPS) continue;

    let gap = gutter;
    if (distribute && count > 1) gap = (webWidth - 2 * margin - count * labelWidth) / (count - 1);

    out.push({
      count,
      webWidth,
      gap,
      leftover: webWidth - block - 2 * margin,
      belowMinimum: required < minWidth - EPS,
    });
  }
  return out;
}

/**
 * Rank layouts. Material cost leads; layouts that tie on cost within
 * `plateTolerance` are then ordered by the smaller cylinder, since the smaller
 * plate is cheaper to make. The bucket keeps the comparison transitive.
 */
function rankOptions(options, plateTolerance, metric) {
  const tol = plateTolerance > 0 ? plateTolerance : DEFAULT_PLATE_TOLERANCE;
  const base = Math.log1p(tol);
  options.forEach((o) => {
    o.rankMetric = metric(o);
    o.costBucket = Math.round(Math.log(o.rankMetric) / base);
  });
  options.sort(
    (a, b) =>
      a.costBucket - b.costBucket ||
      a.repeat - b.repeat ||
      b.perRev - a.perRev ||
      a.webWidth - b.webWidth
  );
}

/**
 * Every viable web × cylinder × orientation combination, best first.
 *
 * Pass `webRange: { min, max }` to let the search choose the slit width, or
 * `webs` to restrict it to widths already in stock.
 */
export function solveStepRepeat({
  label = {},
  webs = [],
  webRange = null,
  cylinders = {},
  gapAcross = 3,
  gapAround = 3,
  edgeMargin = 0,
  distributeAcross = false,
  pitch = 3.175,
  quantity = 0,
  plateTolerance = DEFAULT_PLATE_TOLERANCE,
  cost = null,
  limit = 40,
} = {}) {
  const labelW = num(label.width);
  const labelH = num(label.height);
  const canRotate = label.canRotate !== false;

  const errors = [];
  if (labelW <= 0 || labelH <= 0) errors.push("Enter a label width and height.");

  const useRange = !!webRange && num(webRange.max) > 0;
  const minWidth = useRange ? Math.max(0, num(webRange.min)) : 0;
  const maxWidth = useRange ? num(webRange.max) : 0;
  if (useRange && minWidth > maxWidth) errors.push("The minimum print width is wider than the maximum.");

  const webList = webs
    .filter((w) => w && w.enabled !== false && num(w.width) > 0)
    .map((w) => ({ width: num(w.width), label: w.label || `${round(num(w.width))}` }));
  if (!useRange && !webList.length) errors.push("Enter at least one web width.");
  const teethList = cylinderTeeth(cylinders);
  if (!teethList.length) errors.push("Enter a cylinder range or a list of teeth counts.");
  if (errors.length) return { ok: false, errors, options: [], best: null };

  const minGapAcross = Math.max(0, num(gapAcross));
  const minGapAround = Math.max(0, num(gapAround));
  const margin = Math.max(0, num(edgeMargin));
  const toothPitch = num(pitch) > 0 ? num(pitch) : 3.175;
  const qty = Math.max(0, Math.floor(num(quantity)));

  const orientations = [{ w: labelW, h: labelH, rotated: false }];
  if (canRotate && Math.abs(labelW - labelH) > EPS) {
    orientations.push({ w: labelH, h: labelW, rotated: true });
  }

  const options = [];
  for (const o of orientations) {
    // In range mode the lane count drives the width; in list mode the width
    // drives the lane count.
    const widths = useRange
      ? widthOptions(minWidth, maxWidth, o.w, minGapAcross, margin, distributeAcross).map((x) => ({
          ...x,
          label: `${round(x.webWidth)}`,
        }))
      : webList
          .map((w) => {
            const usable = w.width - 2 * margin;
            if (usable <= EPS) return null;
            const across = acrossFit(usable, o.w, minGapAcross, distributeAcross);
            if (!across) return null;
            return {
              count: across.count,
              webWidth: w.width,
              gap: across.gap,
              leftover: across.leftover,
              label: w.label,
              belowMinimum: false,
            };
          })
          .filter(Boolean);

    for (const width of widths) {
      for (const teeth of teethList) {
        const repeat = teeth * toothPitch;
        const around = aroundFit(repeat, o.h, minGapAround);
        if (!around) continue;

        const perRev = width.count * around.count;
        const labelArea = o.w * o.h;
        const revArea = width.webWidth * repeat;
        const utilisation = (perRev * labelArea) / revArea;
        const materialPerLabel = revArea / perRev;

        const revolutions = qty > 0 ? Math.ceil(qty / perRev) : 0;
        const webLength = revolutions * repeat;

        options.push({
          id: `${width.label}|${teeth}|${o.rotated ? "r" : "n"}`,
          webWidth: round(width.webWidth),
          webLabel: width.label,
          belowMinimum: !!width.belowMinimum,
          teeth,
          repeat: round(repeat, 4),
          rotated: o.rotated,
          labelWidth: round(o.w),
          labelHeight: round(o.h),
          across: width.count,
          around: around.count,
          perRev,
          gapAcross: round(width.gap, 4),
          gapAround: round(around.gap, 4),
          edgeWaste: round(width.leftover + 2 * margin, 4),
          utilisation,
          materialPerLabel,
          revolutions,
          webLength: round(webLength, 2),
          materialArea: revolutions * revArea,
          overrun: revolutions > 0 ? revolutions * perRev - qty : 0,
        });
      }
    }
  }

  if (!options.length) {
    return {
      ok: false,
      errors: ["No layout fits. The label is larger than the web width or the largest repeat."],
      options: [],
      best: null,
    };
  }

  // Rupees beat square millimetres whenever we know what a plate costs. A wider
  // web wastes less film, but every extra millimetre of width is plate area and
  // plate area is bought once per colour. Below a few million labels the plate
  // is the bigger number, so ranking on material alone picks the layout that
  // uses the least film and costs the most to make.
  let rankedBy = "material";
  if (typeof cost === "function" && qty > 0) {
    for (const o of options) Object.assign(o, cost(o) || {});
    if (options.every((o) => Number.isFinite(o.costPerThousand) && o.costPerThousand > 0)) rankedBy = "cost";
  }
  rankOptions(options, plateTolerance, rankedBy === "cost" ? (o) => o.costPerThousand : (o) => o.materialPerLabel);

  return {
    ok: true,
    errors: [],
    rankedBy,
    options: options.slice(0, limit),
    best: options[0],
    evaluated: options.length,
  };
}
