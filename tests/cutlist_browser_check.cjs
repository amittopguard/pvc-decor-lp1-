/**
 * End-to-end check of the cut list optimizer page against a production build.
 *
 * Serves frontend/build with SPA fallback, drives /cutlist in Chromium at
 * desktop and phone widths, and fails on any page error, missing result or
 * horizontal page overflow.
 *
 *   cd frontend && npx craco build
 *   npm install --no-save playwright-core        # if not already present
 *   node tests/cutlist_browser_check.cjs
 *
 * Screenshots are written to $CUTLIST_SHOT_DIR (default: the system temp dir).
 */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BUILD = path.join(__dirname, "..", "frontend", "build");
const SHOTS = process.env.CUTLIST_SHOT_DIR || os.tmpdir();
const PORT = Number(process.env.CUTLIST_PORT || 4173);
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
  let chromium;
  try {
    ({ chromium } = require(path.join(__dirname, "..", "frontend", "node_modules", "playwright-core")));
  } catch {
    try {
      ({ chromium } = require("playwright-core"));
    } catch {
      console.error("playwright-core is not installed. Run: npm install --no-save playwright-core");
      process.exit(2);
    }
  }
  return chromium;
}

/** Playwright's bundled Chromium is not always where it expects it. */
function findChromiumBinary() {
  if (process.env.CUTLIST_CHROMIUM) return process.env.CUTLIST_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(root)) return undefined;
  const dir = fs
    .readdirSync(root)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .pop();
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

/** Hide the toast layer with CSS; removing its nodes would break React. */
const hideToasts = (page) =>
  page.addStyleTag({
    content: '[data-sonner-toaster],section[aria-label^="Notifications"]{display:none !important}',
  });

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

  const browser = await loadChromium().launch({
    executablePath: findChromiumBinary(),
    args: ["--no-sandbox"],
  });
  const base = `http://localhost:${PORT}/cutlist`;
  const errors = [];
  const watch = (page) => {
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      // Analytics and other outbound calls are blocked in CI sandboxes; those
      // network failures are not defects in this page.
      const text = m.text();
      if (m.type() === "error" && !/ERR_(TUNNEL|CONNECTION|NAME|INTERNET)/.test(text)) {
        errors.push(`console: ${text.slice(0, 200)}`);
      }
    });
  };

  console.log("\nDesktop");
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  watch(page);
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector("h1:has-text('Cut List Optimizer')");

  await page.click("button:has-text('Sample')");
  await page.click("button:has-text('Calculate')");
  await page.waitForSelector("text=Sheet 1 of", { timeout: 20000 });

  const sheetCards = await page.$$eval("article h3", (els) => els.length);
  const diagrams = await page.$$eval("svg[role='img']", (els) => els.length);
  const stats = await page.$$eval(".font-display.text-xl", (els) => els.map((e) => e.textContent));
  check("sample project solves and renders sheet cards", sheetCards > 0, `${sheetCards} cards`);
  check("one diagram per sheet", diagrams === sheetCards, `${diagrams} diagrams vs ${sheetCards} cards`);
  check("stat tiles are populated", stats.length >= 6 && stats.every((s) => s.trim()), JSON.stringify(stats));
  check("nothing left unplaced for the sample", stats[4] === "0", `not placed = ${stats[4]}`);
  await page.screenshot({ path: path.join(SHOTS, "cutlist-desktop.png") });

  await hideToasts(page);
  await page.click("label:has-text('Cut lines') input");
  await page.waitForTimeout(200);
  const cutLines = await page.$$eval("svg[role='img'] line[stroke='#dc2626']", (els) => els.length);
  check("cut lines draw when toggled on", cutLines > 0, `${cutLines} lines`);

  await page.selectOption("header select", "in");
  await page.waitForTimeout(300);
  const converted = await page.$eval("table input[inputmode='decimal']", (el) => parseFloat(el.value));
  check("switching to inches converts 720 mm to 28.35 in", Math.abs(converted - 28.3465) < 0.01, `${converted}`);
  await page.selectOption("header select", "mm");
  await page.waitForTimeout(200);

  const inputs = await page.$$("table input[inputmode='decimal']");
  await inputs[0].fill("9000");
  await inputs[1].fill("9000");
  await hideToasts(page);
  await page.click("button:has-text('Calculate')");
  await page.waitForSelector("text=could not be placed", { timeout: 20000 });
  check("a part larger than the stock is reported, not dropped", true);

  console.log("\nImport");
  const imp = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  watch(imp);
  await imp.goto(base, { waitUntil: "networkidle" });
  await imp.click("button:has-text('Import')");
  await imp.waitForSelector("textarea");
  await imp.fill("textarea", "length,width,qty,label\n1200,600,3,Panel A\n800,450,5,Panel B\n300,300,10,Block");
  await imp.click("footer button:has-text('Import')");
  await imp.waitForTimeout(400);
  const lengths = await imp.$$eval("table input[placeholder='length']", (els) =>
    els.map((e) => e.value).filter(Boolean)
  );
  check("CSV import fills the parts table", lengths.slice(0, 3).join(",") === "1200,800,300", lengths.join(","));

  console.log("\nPhone");
  const small = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watch(small);
  await small.goto(base, { waitUntil: "networkidle" });
  await small.click("button:has-text('Calculate')");
  await small.waitForSelector("text=Sheet 1 of", { timeout: 20000 });
  await hideToasts(small);
  const widths = await small.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check("page does not scroll sideways on a phone", widths.doc <= widths.win, JSON.stringify(widths));
  await small.screenshot({ path: path.join(SHOTS, "cutlist-mobile.png") });

  console.log("\nPage errors");
  check("no page or console errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  server.close();

  console.log(`\nscreenshots written to ${SHOTS}`);
  console.log(failures === 0 ? "browser check passed" : `${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
