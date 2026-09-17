/**
 * A very small PDF writer — enough for a report of text, rules and filled
 * rectangles, with no dependency and no font embedding.
 *
 * Only the base-14 Helvetica faces are used, so the file stays a few kilobytes
 * and opens anywhere. Coordinates are given top-left with y running down, the
 * way the rest of the app thinks, and are flipped into PDF space on the way in.
 */

const PAGE = {
  a4: { width: 595.28, height: 841.89 },
  a4landscape: { width: 841.89, height: 595.28 },
};

/** Widths per 1000 units for Helvetica, enough to measure a line of text. */
const W_REG = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

const charWidth = (ch, bold) => {
  const base = W_REG[ch] ?? 556;
  // Helvetica-Bold runs a little wider; this approximation is close enough
  // for column layout and centring.
  return bold ? Math.min(1000, base * 1.06 + 20) : base;
};

export const textWidth = (text, size, bold = false) =>
  [...String(text)].reduce((sum, ch) => sum + charWidth(ch, bold), 0) * (size / 1000);

/**
 * PDF strings here are WinAnsi, so characters outside it are folded to an
 * equivalent rather than emitted as mojibake.
 */
const FOLD = {
  "×": "x", "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"',
  "…": "...", "→": "->", "↻": "(rot)", "≤": "<=", "≥": ">=", "·": "-", "•": "-",
  "²": "2", "³": "3", "°": "deg", " ": " ",
};

export function sanitise(text) {
  return [...String(text ?? "")]
    .map((ch) => {
      if (FOLD[ch]) return FOLD[ch];
      const code = ch.codePointAt(0);
      return code >= 32 && code <= 255 ? ch : "?";
    })
    .join("");
}

const escapeText = (text) => sanitise(text).replace(/([\\()])/g, "\\$1");

const fmt = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return Object.is(v, -0) ? "0" : String(v);
};

const rgb = (hex) => {
  const h = String(hex || "#000").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const int = parseInt(full, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
};

export function createPdf({ size = "a4", title = "Report" } = {}) {
  const page = PAGE[size] || PAGE.a4;
  const pages = [];
  let ops = [];

  const flip = (y) => page.height - y;

  const api = {
    width: page.width,
    height: page.height,
    title,

    addPage() {
      pages.push(ops.join("\n"));
      ops = [];
      return api;
    },

    text(x, y, value, { size: fontSize = 10, bold = false, color = "#0f172a", align = "left" } = {}) {
      const str = escapeText(value);
      if (!str) return api;
      const w = textWidth(sanitise(value), fontSize, bold);
      const dx = align === "right" ? -w : align === "center" ? -w / 2 : 0;
      const [r, g, b] = rgb(color);
      ops.push(
        `BT /${bold ? "F2" : "F1"} ${fmt(fontSize)} Tf ${fmt(r)} ${fmt(g)} ${fmt(b)} rg ` +
          `1 0 0 1 ${fmt(x + dx)} ${fmt(flip(y))} Tm (${str}) Tj ET`
      );
      return api;
    },

    rect(x, y, w, h, { fill, stroke, lineWidth = 0.6 } = {}) {
      if (w <= 0 || h <= 0) return api;
      const parts = [];
      if (fill) {
        const [r, g, b] = rgb(fill);
        parts.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} rg`);
      }
      if (stroke) {
        const [r, g, b] = rgb(stroke);
        parts.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} RG ${fmt(lineWidth)} w`);
      }
      parts.push(`${fmt(x)} ${fmt(flip(y + h))} ${fmt(w)} ${fmt(h)} re`);
      parts.push(fill && stroke ? "B" : fill ? "f" : "S");
      ops.push(parts.join(" "));
      return api;
    },

    line(x1, y1, x2, y2, { color = "#94a3b8", width = 0.6, dash } = {}) {
      const [r, g, b] = rgb(color);
      ops.push(
        `${fmt(r)} ${fmt(g)} ${fmt(b)} RG ${fmt(width)} w ${dash ? `[${dash}] 0 d` : "[] 0 d"} ` +
          `${fmt(x1)} ${fmt(flip(y1))} m ${fmt(x2)} ${fmt(flip(y2))} l S`
      );
      return api;
    },

    /** Assemble the object table, cross-reference table and trailer. */
    toBytes() {
      const contents = [...pages, ops.join("\n")].filter((c, i, all) => c.length || all.length === 1);
      const objects = [];
      const pageCount = contents.length;

      const firstPageObj = 3;
      const firstContentObj = firstPageObj + pageCount;
      const fontRegular = firstContentObj + pageCount;
      const fontBold = fontRegular + 1;

      objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
      const kids = contents.map((_, i) => `${firstPageObj + i} 0 R`).join(" ");
      objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
      contents.forEach((_, i) => {
        objects.push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(page.width)} ${fmt(page.height)}] ` +
            `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
            `/Contents ${firstContentObj + i} 0 R >>`
        );
      });
      contents.forEach((stream) => {
        objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      });
      objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
      objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

      let out = "%PDF-1.4\n";
      const offsets = [0];
      objects.forEach((body, i) => {
        offsets.push(out.length);
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
      });

      const xrefStart = out.length;
      out += `xref\n0 ${objects.length + 1}\n`;
      out += "0000000000 65535 f \n";
      for (let i = 1; i <= objects.length; i++) {
        out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
      }
      out +=
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ` +
        `/Info << /Title (${escapeText(title)}) /Producer (Flexo Label Optimizer) >> >>\n` +
        `startxref\n${xrefStart}\n%%EOF`;

      // Every byte written is Latin-1, so the char codes are the bytes.
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
      return bytes;
    },
  };

  return api;
}

export function downloadPdf(doc, filename) {
  const blob = new Blob([doc.toBytes()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
