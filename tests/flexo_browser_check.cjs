/**
 * End-to-end check of the flexo optimizer page against a production build.
 *
 *   cd frontend && npx craco build
 *   node tests/flexo_browser_check.cjs
 *
 * Screenshots go to $CUTLIST_SHOT_DIR (default: the system temp dir).
 */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BUILD = path.join(__dirname, "..", "frontend", "build");
const SHOTS = process.env.CUTLIST_SHOT_DIR || os.tmpdir();
const PORT = Number(process.env.CUTLIST_PORT || 4176);
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function loadChromium() {
  try {
    return require(path.join(__dirname, "..", "frontend", "node_modules", "playwright-core")).chromium;
  } catch {
    try {
      return require("playwright-core").chromium;
    } catch {
      console.error("playwright-core is not installed. Run: npm install --no-save playwright-core");
      process.exit(2);
    }
  }
}

function findChromiumBinary() {
  if (process.env.CUTLIST_CHROMIUM) return process.env.CUTLIST_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(root)) return undefined;
  const dir = fs.readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().pop();
  if (!dir) return undefined;
  const bin = path.join(root, dir, "chrome-linux", "chrome");
  return fs.existsSync(bin) ? bin : undefined;
}

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

(async () => {
  if (!fs.existsSync(path.join(BUILD, "index.html"))) {
    console.error(`No production build at ${BUILD}. Run "npx craco build" in frontend/ first.`);
    process.exit(2);
  }

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(BUILD, url);
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(BUILD, "index.html");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "text/plain" });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(PORT, r));

  const browser = await loadChromium().launch({ executablePath: findChromiumBinary(), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/ERR_(TUNNEL|CONNECTION|NAME|INTERNET)/.test(t)) errors.push(`console: ${t.slice(0, 200)}`);
  });
  const tap = (selector) => page.locator(selector).first().dispatchEvent("click");
  const hideToasts = () => page.addStyleTag({
    content: '[data-sonner-toaster],section[aria-label^="Notifications"]{display:none !important}',
  });

  await page.goto(`http://localhost:${PORT}/flexo`, { waitUntil: "networkidle" });
  await page.waitForSelector("h1:has-text('Flexo Label Optimizer')");
  // Start from the built-in sample so a stored project cannot skew the run.
  await tap("button:has-text('Sample')");
  await page.waitForTimeout(300);

  console.log("\nStep & repeat");
  await tap("button:has-text('Calculate')");
  await page.waitForSelector("text=One repeat", { timeout: 20000 });
  await hideToasts();
  const srStats = await page.$$eval(".font-display.text-xl", (e) => e.map((x) => x.textContent));
  const srRows = await page.$$eval("table tbody tr", (e) => e.length);
  const srRects = await page.$$eval("svg[role='img'] rect", (e) => e.length);
  check("layout is reported as across × around", /^\d+ × \d+$/.test(srStats[0]), srStats[0]);
  check("a cylinder is chosen", /^\d+T$/.test(srStats[1]), srStats[1]);
  check("alternatives are listed", srRows > 1, `${srRows} rows`);
  check("the repeat diagram draws labels", srRects > 5, `${srRects} rects`);
  await page.screenshot({ path: path.join(SHOTS, "flexo-repeat.png") });

  // Selecting a different cylinder must redraw the diagram.
  const before = await page.$eval("svg[role='img']", (e) => e.outerHTML.length);
  await page.click("table tbody tr:nth-child(3)");
  await page.waitForTimeout(300);
  const after = await page.$eval("svg[role='img']", (e) => e.outerHTML.length);
  check("clicking an alternative previews it", before !== after, "diagram did not change");

  console.log("\nGang run");
  await tap("button:has-text('Gang run')");
  await page.waitForTimeout(200);
  await tap("button:has-text('Calculate')");
  await page.waitForSelector("text=Plate 1 of", { timeout: 30000 });
  await hideToasts();
  const laneRows = await page.$$eval("article table tbody tr", (e) => e.length);
  const gangStats = await page.$$eval(".font-display.text-xl", (e) => e.map((x) => x.textContent));
  const printed = await page.$$eval("article table tbody tr td:nth-child(6)", (e) => e.map((x) => x.textContent.trim()));
  check("plate count is reported", /^\d+$/.test(gangStats[0]), gangStats[0]);
  check("every SKU has a row", laneRows >= 3, `${laneRows} rows`);
  check("printed quantities are filled in", printed.filter((t) => /\d/.test(t)).length >= 3, printed.join(" | "));
  await page.screenshot({ path: path.join(SHOTS, "flexo-gang.png") });

  console.log("\nMulti-plate gang and PDF report");
  // Ten wide SKUs cannot share one plate, so the planner must split them.
  await page.evaluate(() => {
    const skus = Array.from({ length: 10 }, (_, i) => ({
      id: `bulk-${i}`,
      name: `Label ${i + 1}`,
      width: 90 + (i % 3) * 15,
      height: 50 + (i % 4) * 10,
      qty: 20000 + i * 6000,
      canRotate: true,
      enabled: true,
    }));
    const raw = JSON.parse(window.localStorage.getItem("flexo.project.v1"));
    window.localStorage.setItem("flexo.project.v1", JSON.stringify({ ...raw, skus, tab: "gang" }));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("h1:has-text('Flexo Label Optimizer')");
  await tap("button:has-text('Calculate')");
  await page.waitForSelector("text=Plate 1 of", { timeout: 40000 });
  await hideToasts();

  const plateHeads = await page.$$eval("article h3", (els) => els.map((e) => e.textContent.trim()));
  check("the job is split across multiple plates", plateHeads.length > 1, `${plateHeads.length} plates`);
  check("plates are numbered", /^Plate 1 of \d+/.test(plateHeads[0]), plateHeads[0]);
  const skuRows = await page.$$eval("article table tbody tr", (els) => els.length);
  check("all ten SKUs appear across the plates", skuRows === 10, `${skuRows} rows`);
  const splitNotice = await page.$("text=will not fit one plate");
  check("the split is explained", !!splitNotice);
  await page.screenshot({ path: path.join(SHOTS, "flexo-plates-split.png"), fullPage: true });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    tap("button:has-text('Export PDF')"),
  ]);
  const pdfPath = path.join(SHOTS, "flexo-report.pdf");
  await download.saveAs(pdfPath);
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfText = pdfBytes.toString("latin1");
  check("a PDF is downloaded", pdfBytes.length > 1000, `${pdfBytes.length} bytes`);
  check("it is a valid PDF header", pdfText.startsWith("%PDF-"));
  const pageCount = parseInt((pdfText.match(/\/Count (\d+)/) || [])[1] || "0", 10);
  check("it has a page per plate plus the summary", pageCount === plateHeads.length + 1, `${pageCount} pages for ${plateHeads.length} plates`);
  check("the report names the labels", pdfText.includes("Label 1"), "SKU names missing from the PDF");

  console.log("\nPlate nesting");
  await tap("button:has-text('Plate nesting')");
  await page.waitForTimeout(200);
  await tap("button:has-text('Calculate')");
  await page.waitForSelector("text=Sheet 1 of", { timeout: 20000 });
  await hideToasts();
  const plateSheets = await page.$$eval("article h3", (e) => e.length);
  check("plate sheets are laid out", plateSheets > 0, `${plateSheets} sheets`);
  const presets = await page.$$eval("button:has-text('1067')", (e) => e.length);
  check("standard plate sizes are offered", presets > 0);
  await page.screenshot({ path: path.join(SHOTS, "flexo-plates.png") });

  console.log("\nLayout key");
  await tap("button:has-text('Step & repeat')");
  await page.waitForTimeout(150);
  await tap("button:has-text('What these measurements mean')");
  await page.waitForTimeout(250);
  const keyLabels = await page.$$eval("section svg[role='img'] text", (els) => els.map((e) => e.textContent.trim()));
  const wanted = ["web width — what you slit to", "gutter across", "gap around", "edge margin", "one repeat", "label width"];
  check(
    "the diagram key names every setting",
    wanted.every((w) => keyLabels.some((t) => t === w)),
    `missing: ${wanted.filter((w) => !keyLabels.some((t) => t === w)).join(", ")}`
  );
  await page.screenshot({ path: path.join(SHOTS, "flexo-key.png") });

  console.log("\nUnits and layout");
  await tap("button:has-text('Step & repeat')");
  await page.waitForTimeout(150);
  await page.selectOption("header select", "in");
  await page.waitForTimeout(300);
  const inchValue = await page.$eval("input[inputmode='decimal']", (e) => parseFloat(e.value));
  check("switching to inches converts 100 mm to 3.937 in", Math.abs(inchValue - 3.937) < 0.01, `${inchValue}`);
  await page.selectOption("header select", "mm");
  await page.waitForTimeout(200);

  const small = await browser.newPage({ viewport: { width: 390, height: 844 } });
  small.on("pageerror", (e) => errors.push(`pageerror(mobile): ${e.message}`));
  await small.goto(`http://localhost:${PORT}/flexo`, { waitUntil: "networkidle" });
  await small.click("button:has-text('Calculate')");
  await small.waitForSelector("text=One repeat", { timeout: 20000 });
  const widths = await small.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check("no sideways scroll on a phone", widths.doc <= widths.win, JSON.stringify(widths));

  console.log("\nPage errors");
  check("no page or console errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  server.close();
  console.log(`\nscreenshots written to ${SHOTS}`);
  console.log(failures === 0 ? "flexo browser check passed" : `${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
