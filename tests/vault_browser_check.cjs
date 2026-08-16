/**
 * End-to-end check of the artwork and plate vault.
 *
 * Drives the built frontend against a live vault API. The API is served by
 * tests/vault_test_server.py, which mounts the real vault module on SQLite, so
 * this exercises the actual request/response path without the production DB.
 *
 *   cd frontend && npx craco build
 *   node tests/vault_browser_check.cjs
 */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BUILD = path.join(__dirname, "..", "frontend", "build");
const SHOTS = process.env.CUTLIST_SHOT_DIR || os.tmpdir();
const WEB_PORT = Number(process.env.VAULT_WEB_PORT || 4190);
const API_PORT = Number(process.env.VAULT_API_PORT || 8000);
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

function loadChromium() {
  try {
    return require(path.join(__dirname, "..", "frontend", "node_modules", "playwright-core")).chromium;
  } catch {
    console.error("playwright-core is not installed. Run: npm install --no-save playwright-core");
    process.exit(2);
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

const waitFor = async (url, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

(async () => {
  if (!fs.existsSync(path.join(BUILD, "index.html"))) {
    console.error(`No production build at ${BUILD}. Run "npx craco build" in frontend/ first.`);
    process.exit(2);
  }

  const apiProc = spawn("python3", [path.join(__dirname, "vault_test_server.py"), String(API_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const apiLog = [];
  apiProc.stdout.on("data", (d) => apiLog.push(d.toString()));
  apiProc.stderr.on("data", (d) => apiLog.push(d.toString()));

  const cleanup = () => {
    try {
      apiProc.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  };
  process.on("exit", cleanup);

  if (!(await waitFor(`http://127.0.0.1:${API_PORT}/api/vault/customers`))) {
    console.error("Vault API did not start:\n" + apiLog.join(""));
    cleanup();
    process.exit(2);
  }

  // Serve the build, and proxy /api to the test API so the page's own client works.
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      const proxy = http.request(
        { host: "127.0.0.1", port: API_PORT, path: req.url, method: req.method, headers: req.headers },
        (up) => {
          res.writeHead(up.statusCode, up.headers);
          up.pipe(res);
        }
      );
      proxy.on("error", () => {
        res.writeHead(502);
        res.end("proxy error");
      });
      req.pipe(proxy);
      return;
    }
    const url = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(BUILD, url);
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(BUILD, "index.html");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "text/plain" });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(WEB_PORT, r));

  const browser = await loadChromium().launch({ executablePath: findChromiumBinary(), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() !== "error") return;
    // Aborted third-party scripts and the 409 this test deliberately provokes
    // are expected; anything else, including other failed API calls, is not.
    const expected = /ERR_(TUNNEL|CONNECTION|NAME|INTERNET|FAILED)|favicon|status of 409/.test(t);
    if (!expected) errors.push(`console: ${t.slice(0, 200)}`);
  });
  const tap = (sel) => page.locator(sel).first().dispatchEvent("click");
  const hideToasts = () =>
    page.addStyleTag({ content: '[data-sonner-toaster],section[aria-label^="Notifications"]{display:none !important}' });

  // The production build has the live backend URL compiled in, so API calls are
  // routed to the test server here rather than rebuilding the app for the test.
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: `http://127.0.0.1:${API_PORT}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch (e) {
      await route.abort();
    }
  });
  // Analytics and webfonts cannot be reached from the sandbox; skip the noise.
  await page.route(/googletagmanager|posthog|fonts\.googleapis|emergent\.sh/, (route) => route.abort());

  const base = `http://localhost:${WEB_PORT}/vault`;
  await page.goto(base, { waitUntil: "networkidle" });

  console.log("\nSign in");
  await page.waitForSelector("h1:has-text('Artwork & plate vault')");
  await page.fill("input[type=password]", "test-password");
  await tap("button:has-text('Open the vault')");
  await page.waitForSelector("button:has-text('Reports')", { timeout: 20000 });
  check("the admin password opens the vault", true);

  const addRecord = async (panelTitle, values) => {
    const panel = page.locator("section", { has: page.locator(`h2:text-is("${panelTitle}")`) }).first();
    const newRow = panel.locator("tbody tr").last();
    for (const [label, value] of Object.entries(values)) {
      const field = newRow.locator(`[aria-label="new ${label}"]`);
      if (!(await field.count())) throw new Error(`No field "${label}" in ${panelTitle}`);
      const tag = await field.first().evaluate((el) => el.tagName);
      if (tag === "SELECT") await field.first().selectOption({ label: value });
      else await field.first().fill(String(value));
    }
    await newRow.locator("button[title='Add record']").dispatchEvent("click");
    await page.waitForTimeout(700);
  };

  console.log("\nCustomers, moulders and vendors");
  await tap("button:has-text('Customers & vendors')");
  await page.waitForTimeout(400);
  await addRecord("Moulders", { Name: "Sunrise Moulders", City: "Sonipat" });
  await addRecord("Plate vendors", { Name: "Delhi Plates", City: "Delhi" });
  await addRecord("Customers", { Name: "Acme Foods", Code: "ACME", Moulder: "Sunrise Moulders" });
  await hideToasts();
  const customerRow = await page.locator("section", { has: page.locator('h2:text-is("Customers")') }).first().locator("tbody tr").first().innerText();
  check("a customer saves with its moulder", customerRow.includes("Acme Foods") && customerRow.includes("Sunrise Moulders"), customerRow);

  console.log("\nKLD dies and moulds");
  await tap("button:has-text('KLD & moulds')");
  await page.waitForTimeout(400);
  await addRecord("KLD dies", { "KLD number": "KLD-101", "Label width": "100", "Label height": "60" });
  await addRecord("Moulds", { "Mould code": "MLD-77", Moulder: "Sunrise Moulders", Cavities: "4" });
  await hideToasts();
  const dieRow = await page.locator("section", { has: page.locator('h2:text-is("KLD dies")') }).first().locator("tbody tr").first().innerText();
  check("a KLD die saves", dieRow.includes("KLD-101"), dieRow);
  const mouldRow = await page.locator("section", { has: page.locator('h2:text-is("Moulds")') }).first().locator("tbody tr").first().innerText();
  check("a mould saves separately, tied to the moulder", mouldRow.includes("MLD-77") && mouldRow.includes("Sunrise"), mouldRow);

  console.log("\nArtwork patched to KLD and mould");
  await tap("button:has-text('Artwork')");
  await page.waitForTimeout(400);
  for (const code of ["AW-1", "AW-2", "AW-3"]) {
    await addRecord("Artwork", { Code: code, Name: `Label ${code}`, Customer: "Acme Foods (ACME)", KLD: "KLD-101", Mould: "MLD-77" });
  }
  await hideToasts();
  const artRows = await page.locator("section", { has: page.locator('h2:text-is("Artwork")') }).first().locator("tbody tr").count();
  check("three artworks are patched to one KLD", artRows === 4, `${artRows - 1} artworks (plus the new row)`);

  console.log("\nArtwork file upload");
  const tmpFile = path.join(SHOTS, "vault-artwork.pdf");
  fs.writeFileSync(tmpFile, "%PDF-1.4 test artwork");
  await tap("button:has-text('AW-1')");
  await page.waitForTimeout(400);
  await page.setInputFiles("input[type=file]", tmpFile);
  await page.waitForTimeout(1200);
  const fileListed = await page.locator("li:has-text('vault-artwork.pdf')").count();
  check("an artwork file uploads and lists", fileListed > 0, `${fileListed} files listed`);

  console.log("\nOne plate carrying multiple artworks");
  await tap("button:has-text('Plates')");
  await page.waitForTimeout(400);
  await tap("button:has-text('New plate')");
  await page.waitForSelector("text=Artworks on this plate");
  await page.locator("[aria-label='Plate number']").fill("PL-001");
  await page.locator("[aria-label='Plate vendor']").selectOption({ label: "Delhi Plates" });
  await page.locator("[aria-label='Plate KLD die']").selectOption({ label: "KLD-101" });
  await page.locator("[aria-label='Plate actual cost']").fill("12000");
  await page.locator("[aria-label='Plate cost paid by']").selectOption({ label: "Customer" });
  for (const code of ["AW-1", "AW-2", "AW-3"]) {
    await page.locator("select[aria-label='Add artwork to plate']").selectOption({ label: `${code} — Label ${code}` });
    await page.waitForTimeout(200);
  }
  const lineCount = await page.locator("table tbody tr:has-text('AW-')").count();
  check("three artworks are added to one plate", lineCount === 3, `${lineCount} lines`);

  await tap("button:has-text('Split cost evenly')");
  await page.waitForTimeout(300);
  const balanced = await page.locator("text=/Shares ₹12,000.*of ₹12,000/").count();
  check("splitting the cost balances the shares", balanced > 0, await page.locator("footer span").first().innerText());

  await tap("button:has-text('Save plate')");
  await page.waitForSelector("text=PL-001", { timeout: 20000 });
  await hideToasts();
  const plateRow = await page.locator("tbody tr:has-text('PL-001')").first().innerText();
  check("the plate saves with its artwork count", plateRow.includes("3"), plateRow);
  check("the plate shows the vendor and payer", plateRow.includes("Delhi Plates") && /customer/i.test(plateRow), plateRow);
  await page.screenshot({ path: path.join(SHOTS, "vault-plates.png"), fullPage: true });

  console.log("\nReports");
  await tap("button:has-text('Reports')");
  await page.waitForTimeout(900);
  await hideToasts();
  const body = await page.locator("main").innerText();
  check("the artwork report is customer-wise", body.includes("Acme Foods") && body.includes("KLD-101"), "");
  check("the KLD report counts the patched artworks", /KLD-101[\s\S]{0,120}3 artworks/.test(body), "");
  check("plate spend is reported", body.includes("₹12,000"), "");
  check("reconciliation reports everything clean", /Everything reconciles/.test(body), body.slice(0, 200));
  await page.screenshot({ path: path.join(SHOTS, "vault-reports.png"), fullPage: true });

  console.log("\nGuards surface in the UI");
  await tap("button:has-text('Customers & vendors')");
  await page.waitForTimeout(400);
  const custPanel = page.locator("section", { has: page.locator('h2:text-is("Customers")') }).first();
  await custPanel.locator("tbody tr").first().locator("button[title='Delete']").dispatchEvent("click");
  await page.waitForTimeout(800);
  const guard = await custPanel.locator("text=/Still used by/").count();
  check("deleting a customer with artworks is refused with a reason", guard > 0, await custPanel.innerText().then((t) => t.slice(0, 120)));

  console.log("\nPage errors");
  check("no page or console errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  server.close();
  cleanup();
  console.log(`\nscreenshots written to ${SHOTS}`);
  console.log(failures === 0 ? "vault browser check passed" : `${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
