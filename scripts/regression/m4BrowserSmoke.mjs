import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const PORT = 4173;

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createStaticServer(rootDir) {
  return http.createServer(async (req, res) => {
    try {
      const rawPath = req.url ? req.url.split("?")[0] : "/";
      const safePath = rawPath === "/" ? "/index.html" : rawPath;
      const normalized = path.normalize(safePath).replace(/^([.][.][/\\])+/, "");
      const fullPath = path.join(rootDir, normalized);
      const data = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME.get(ext) || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    }
  });
}

async function main() {
  const server = createStaticServer(ROOT);
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.waitForSelector("#menuRoot:not(.hidden)");
    assert(await page.locator("#menuPlayBtn").isVisible(), "Play button not visible");
    assert(await page.locator("#menuSettingsBtn").isVisible(), "Settings button not visible");
    assert(await page.locator("#menuContinueBtn").isVisible(), "Continue button not visible");

    await page.click("#menuSettingsBtn");
    await page.waitForSelector('[data-menu-screen="settings_menu"]:not(.hidden)');
    await page.selectOption("#menuDefaultSpeedSelect", "4");
    await page.click("#menuBackFromSettingsBtn");
    await page.waitForSelector('[data-menu-screen="main_menu"]:not(.hidden)');

    await page.click("#menuPlayBtn");
    await page.waitForSelector('[data-menu-screen="new_campaign_location_select"]:not(.hidden)');
    await page.click('[data-menu-location="meadowbrook"]');
    await page.fill("#menuSeedInput", "4242");
    await page.click("#menuStartCampaignBtn");

    await page.waitForSelector("#appShell:not(.hidden)");
    await page.waitForSelector("#commandBoardView");
    await page.waitForSelector("#delegationView");
    await page.waitForSelector("#analyticsView");
    await page.waitForSelector("#scoutingView");

    await page.click("#nextDayBtn");
    await page.waitForTimeout(500);

    const commandText = await page.locator("#commandBoardView").innerText();
    assert(commandText.length > 40, "Command board did not render content");
    await page.click('#commandBoardView button[data-command-category="finance"]');
    await page.click('#commandBoardView button[data-command-read-all]');

    const clerkToggle = page.locator(
      '#delegationView input[data-delegation-role="clerk"]:not([data-delegation-task])'
    );
    if (!(await clerkToggle.isChecked())) {
      await clerkToggle.check();
    }

    await page.click("#nextDayBtn");
    await page.waitForTimeout(500);
    const delegationText = await page.locator("#delegationView").innerText();
    assert(/clerk/i.test(delegationText), "Delegation updates did not appear");

    await page.click('#scoutingView button[data-scouting-sweep="rival"]');
    await page.waitForTimeout(500);
    const scoutingText = await page.locator("#scoutingView").innerText();
    assert(scoutingText.length > 40, "Scouting panel did not render content");

    const analyticsText = await page.locator("#analyticsView").innerText();
    assert(
      analyticsText.includes("Conversion") && analyticsText.includes("Margin"),
      "Analytics panel missing KPI text"
    );

    console.log("BROWSER_SMOKE_PASS: main menu + M4 interactions validated.");
    await browser.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
