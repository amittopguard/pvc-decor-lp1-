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

  console.log("\nRanked by rupees, not square millimetres");
  let main = await page.locator("main").innerText();
  check("with rates on, the ranking is by cost", /ranked by cost per thousand/i.test(main), main.slice(0, 200));
  check("cost per thousand is shown", /PER 1000[\s\S]{0,20}₹/i.test(main), main.slice(0, 300));
  check(
    "and split into plates and film",
    /₹[\d,.]+ plates \+ ₹[\d,.]+ film/.test(main),
    main.slice(0, 400)
  );
  const cheapWeb = await page.$$eval(".font-display.text-xl", (e) => e.map((x) => x.textContent));

  // More colours means more plates, and a bigger plate bill pushes the answer
  // to a narrower web. This is the whole reason the ranking changed.
  await page.locator("[aria-label='Colours in the job']").fill("8");
  await tap("button:has-text('Calculate')");
  await page.waitForTimeout(900);
  await hideToasts();
  const eightWeb = await page.$$eval(".font-display.text-xl", (e) => e.map((x) => x.textContent));
  const widthOf = (stats) => parseFloat((stats.find((s) => /mm$/.test(s)) || "0").replace(/[^\d.]/g, ""));
  check(
    "eight colours never widens the web against four",
    widthOf(eightWeb) <= widthOf(cheapWeb),
    `${widthOf(eightWeb)} vs ${widthOf(cheapWeb)}`
  );
  await page.locator("[aria-label='Colours in the job']").fill("4");

  // Turning the rates off must fall back to the material ranking, not break.
  await page.locator("input[title='Rank layouts by cost']").dispatchEvent("click");
  await page.waitForTimeout(200);
  await tap("button:has-text('Calculate')");
  await page.waitForTimeout(900);
  await hideToasts();
  main = await page.locator("main").innerText();
  check("switching rates off ranks by material again", /ranked by material per label/i.test(main), main.slice(0, 200));
  await page.locator("input[title='Rank layouts by cost']").dispatchEvent("click");
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, "flexo-rates.png"), fullPage: true });

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
  const gangMain = await page.locator("main").innerText();
  check(
    "the split is costed, not just counted",
    /PER 1000[\s\S]{0,20}₹/i.test(gangMain) && /plates \+ ₹/.test(gangMain),
    gangMain.slice(0, 400)
  );
  check(
    "and the reason for the split is the plate bill",
    /every extra plate buys another set/.test(gangMain),
    gangMain.slice(gangMain.indexOf("will not fit"), gangMain.indexOf("will not fit") + 260)
  );
  await page.screenshot({ path: path.join(SHOTS, "flexo-plates-split.png"), fullPage: true });

  console.log("\nMoving a SKU from one plate to another");
  const laneNames = () =>
    page.$$eval("article", (arts) =>
      arts.map((a) => [...a.querySelectorAll("tbody tr td:first-child")].map((td) => td.innerText.trim().split("\n")[0]))
    );
  const lanesBefore = await laneNames();
  check("there are at least two plates to move between", lanesBefore.length >= 2, `${lanesBefore.length} plates`);

  // The move box: the way that works by touch, and the way a test can drive.
  const firstName = lanesBefore[0][0];
  await page.locator("article").first().locator("tbody tr").first()
    .locator("select[aria-label^='Move ']").selectOption("2");
  await page.waitForTimeout(1500);
  await hideToasts();
  let lanesAfter = await laneNames();
  check(
    `${firstName} left the plate it was on`,
    !lanesAfter[0].includes(firstName),
    `plate 1 still has: ${lanesAfter[0].join(", ")}`
  );
  check("and landed on plate 2", lanesAfter[1].includes(firstName), `plate 2 has: ${lanesAfter[1].join(", ")}`);
  const movedText = await page.locator("main").innerText();
  check("the results say the grouping is now the operator's", /moved these SKUs yourself/i.test(movedText),
    movedText.slice(0, 200));

  // Dragging the label out of the diagram — the thing anyone actually reaches
  // for, driven with real pointer events so touch is covered by the same path.
  const plate2 = page.locator("article[data-plate='2']");
  const beforeDiagram = await laneNames();
  const grabbable = page.locator("article[data-plate='1'] svg g[data-sku]").first();
  check("labels in the diagram are grabbable", (await grabbable.count()) > 0, "no grabbable rect found");

  const from = await grabbable.boundingBox();
  const to = await plate2.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 40, from.y + from.height / 2 + 40, { steps: 5 });
  const carried = await page.locator("div.fixed.z-50").count();
  check("the label follows the pointer while dragging", carried > 0, `${carried} floating labels`);
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await hideToasts();

  const afterDiagram = await laneNames();
  check(
    "dragging a label off the diagram moves it",
    JSON.stringify(afterDiagram) !== JSON.stringify(beforeDiagram),
    `before ${JSON.stringify(beforeDiagram)} after ${JSON.stringify(afterDiagram)}`
  );
  check("and the floating label is gone once dropped", (await page.locator("div.fixed.z-50").count()) === 0);

  // And the drag path itself — the handlers, driven as a browser drives them.
  const dragResult = await page.evaluate(() => {
    const rows = document.querySelectorAll("article tbody tr");
    const src = rows[0];
    const name = src.querySelector("td").innerText.trim().split("\n")[0];
    const target = document.querySelectorAll("article")[1];
    const dt = new DataTransfer();
    const fire = (el, type) => {
      const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    fire(src, "dragstart");
    const overTakes = fire(target, "dragover");
    const dropTakes = fire(target, "drop");
    return { name, carried: dt.getData("text/plain"), overTakes, dropTakes };
  });
  check("dragging a row carries the SKU with it", !!dragResult.carried, JSON.stringify(dragResult));
  check("a plate accepts the drop", dragResult.overTakes && dragResult.dropTakes, JSON.stringify(dragResult));
  await page.waitForTimeout(1500);
  await hideToasts();
  lanesAfter = await laneNames();
  check(
    `${dragResult.name} moved by drag as well`,
    !lanesAfter[0].includes(dragResult.name),
    `plate 1 has: ${lanesAfter[0].join(", ")}`
  );

  // Back to the planner, so the report below is the planner's own split.
  await tap("button:has-text(\"Back to the planner's split\")");
  await page.waitForTimeout(400);
  await tap("button:has-text('Calculate')");
  await page.waitForSelector("text=Plate 1 of", { timeout: 40000 });
  await hideToasts();

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
  check(
    "and carries the money the plan was ranked on",
    /PER 1000/.test(pdfText) && /JOB TOTAL/.test(pdfText) && /Rs /.test(pdfText),
    "cost summary missing from the PDF"
  );

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
