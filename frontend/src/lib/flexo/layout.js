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
};

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
 * Every viable web × cylinder × orientation combination, best first.
 *
 * `webs` are candidate web widths — pass one to fix the web, or several to let
 * the search pick the cheapest slit width.
 */
export function solveStepRepeat({
  label = {},
  webs = [],
  cylinders = {},
  gapAcross = 3,
  gapAround = 3,
  edgeMargin = 0,
  distributeAcross = false,
  pitch = 3.175,
  quantity = 0,
  limit = 40,
} = {}) {
  const labelW = num(label.width);
  const labelH = num(label.height);
  const canRotate = label.canRotate !== false;

  const errors = [];
  if (labelW <= 0 || labelH <= 0) errors.push("Enter a label width and height.");
  const webList = webs
    .filter((w) => w && w.enabled !== false && num(w.width) > 0)
    .map((w) => ({ width: num(w.width), label: w.label || `${round(num(w.width))}` }));
  if (!webList.length) errors.push("Enter at least one web width.");
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
  for (const web of webList) {
    const usable = web.width - 2 * margin;
    if (usable <= EPS) continue;

    for (const teeth of teethList) {
      const repeat = teeth * toothPitch;

      for (const o of orientations) {
        const around = aroundFit(repeat, o.h, minGapAround);
        const across = acrossFit(usable, o.w, minGapAcross, distributeAcross);
        if (!around || !across) continue;

        const perRev = across.count * around.count;
        const labelArea = o.w * o.h;
        const revArea = web.width * repeat;
        const utilisation = (perRev * labelArea) / revArea;
        const materialPerLabel = revArea / perRev;

        const revolutions = qty > 0 ? Math.ceil(qty / perRev) : 0;
        const webLength = revolutions * repeat;

        options.push({
          id: `${web.label}|${teeth}|${o.rotated ? "r" : "n"}`,
          webWidth: round(web.width),
          webLabel: web.label,
          teeth,
          repeat: round(repeat, 4),
          rotated: o.rotated,
          labelWidth: round(o.w),
          labelHeight: round(o.h),
          across: across.count,
          around: around.count,
          perRev,
          gapAcross: round(across.gap, 4),
          gapAround: round(around.gap, 4),
          edgeWaste: round(across.leftover + 2 * margin, 4),
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

  // Cheapest material per label wins; then more labels per turn (faster run),
  // then the smaller cylinder, which is usually the cheaper plate.
  options.sort(
    (a, b) =>
      a.materialPerLabel - b.materialPerLabel ||
      b.perRev - a.perRev ||
      a.teeth - b.teeth ||
      a.webWidth - b.webWidth
  );

  return { ok: true, errors: [], options: options.slice(0, limit), best: options[0], evaluated: options.length };
}
