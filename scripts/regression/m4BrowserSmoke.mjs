import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();

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

const ROUTE_EXPECTATIONS = Object.freeze({
  command: "#planningStatusView",
  operations: "#inventoryView",
  staff: "#staffView",
  world: "#worldActorsView",
  analytics: "#analyticsView",
  reports: "#reportFilterInput"
});
const EXPECTED_UI_CONTRACT_VERSION = "m6-ui-handoff-v1";
const REQUIRED_PANEL_MOUNTS = Object.freeze([
  "nav_bar",
  "alert_strip",
  "planning_board",
  "command_board",
  "staff_roster",
  "world_influence",
  "analytics_dashboard",
  "report_daily_surface",
  "report_weekly_surface",
  "report_log_surface"
]);
const REQUIRED_ACTION_HOOKS = Object.freeze([
  "route_command",
  "route_operations",
  "route_staff",
  "route_world",
  "route_analytics",
  "route_reports",
  "action_skip_next_day",
  "action_commit_plan",
  "action_file_compliance",
  "action_hire_server",
  "alert_jump"
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

async function dismissDialogs(page) {
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
  });
}

async function ensureExpandedForControl(page, controlId) {
  return page.evaluate((id) => {
    const target = document.getElementById(id);
    if (!target) {
      return false;
    }
    const expandCollapsed = (group) => {
      if (!group || !group.classList.contains("is-collapsed")) {
        return;
      }
      group.classList.remove("is-collapsed");
      const toggle = group.querySelector(".group-toggle");
      if (toggle) {
        toggle.textContent = "Collapse";
      }
    };
    let group = target.closest(".group");
    while (group) {
      expandCollapsed(group);
      group = group.parentElement ? group.parentElement.closest(".group") : null;
    }
    return true;
  }, controlId);
}

async function waitForUiUnlock(page) {
  await page.waitForFunction(() => {
    const navButtons = Array.from(document.querySelectorAll("#inGameNav button[data-ui-route]"));
    if (navButtons.length === 0) {
      return false;
    }
    return navButtons.every((btn) => !btn.disabled);
  }, undefined, { timeout: 20000 });
}

async function routeTo(page, routeId) {
  await waitForUiUnlock(page);
  const routeButton = page.locator(`#inGameNav button[data-ui-route="${routeId}"]`);
  assert((await routeButton.count()) > 0, `Route button missing: ${routeId}`);
  await routeButton.first().click();
  await page.waitForTimeout(220);
  assert(
    (await page.locator(`#inGameNav button[data-ui-route="${routeId}"][aria-pressed="true"]`).count()) === 1,
    `Route did not activate: ${routeId}`
  );
  const expectedSelector = ROUTE_EXPECTATIONS[routeId];
  if (expectedSelector) {
    const expected = page.locator(expectedSelector).first();
    assert(await expected.isVisible(), `Route ${routeId} did not reveal ${expectedSelector}`);
  }
}

async function reachAndClick(page, routeId, controlId) {
  await routeTo(page, routeId);
  const expanded = await ensureExpandedForControl(page, controlId);
  assert(expanded, `Control missing for expansion: #${controlId}`);
  await page.waitForFunction((id) => {
    const node = document.getElementById(id);
    return Boolean(node && !node.disabled && node.getClientRects().length > 0);
  }, controlId, { timeout: 20000 });
  await page.click(`#${controlId}`);
  await waitForUiUnlock(page);
}

async function assertControlReachable(page, routeId, controlId) {
  await routeTo(page, routeId);
  const expanded = await ensureExpandedForControl(page, controlId);
  assert(expanded, `Control missing for expansion: #${controlId}`);
  await page.waitForFunction((id) => {
    const node = document.getElementById(id);
    return Boolean(node && !node.disabled && node.getClientRects().length > 0);
  }, controlId, { timeout: 20000 });
}

async function assertUiHandoffContract(page) {
  const snapshot = await page.evaluate(() => {
    const api = window.tavernSim;
    if (!api || typeof api.uiHandoff !== "function") {
      return { ok: false, error: "window.tavernSim.uiHandoff is unavailable." };
    }
    const contract = api.uiHandoff();
    const routeButtons = Array.from(document.querySelectorAll("#inGameNav button[data-ui-route]"))
      .map((node) => `${node.getAttribute("data-ui-route") || ""}`.trim())
      .filter((id) => id.length > 0);
    const contractRouteIds = Array.isArray(contract.routeIds) ? contract.routeIds.slice() : [];
    const routeIdSet = new Set(contractRouteIds);
    const missingRouteButtons = contractRouteIds.filter((routeId) => !routeButtons.includes(routeId));
    const unknownRouteButtons = routeButtons.filter((routeId) => !routeIdSet.has(routeId));
    const panelMountEntries = contract.panelMountPoints && typeof contract.panelMountPoints === "object"
      ? Object.entries(contract.panelMountPoints)
      : [];
    const missingMounts = panelMountEntries
      .filter(([mountId, nodeId]) => {
        const node = document.getElementById(nodeId);
        return !node || node.getAttribute("data-ui-mount") !== mountId;
      })
      .map(([mountId, nodeId]) => `${mountId}:${nodeId}`);
    const actionHookEntries = contract.actionHooks && typeof contract.actionHooks === "object"
      ? Object.entries(contract.actionHooks)
      : [];
    const missingHooks = actionHookEntries
      .filter(([hookId, selector]) => {
        const nodes = Array.from(document.querySelectorAll(selector));
        if (nodes.length === 0) {
          return true;
        }
        return nodes.some((node) => node.getAttribute("data-ui-action-hook") !== hookId);
      })
      .map(([hookId]) => hookId);
    return {
      ok: true,
      version: contract.version || "",
      routeIds: contractRouteIds,
      panelMountKeys: panelMountEntries.map(([key]) => key),
      actionHookKeys: actionHookEntries.map(([key]) => key),
      missingRouteButtons,
      unknownRouteButtons,
      missingMounts,
      missingHooks
    };
  });

  assert(snapshot.ok, snapshot.error || "Unable to read UI handoff contract.");
  assert(
    snapshot.version === EXPECTED_UI_CONTRACT_VERSION,
    `Unexpected UI handoff contract version: ${snapshot.version}`
  );
  assert(snapshot.missingRouteButtons.length === 0, `Missing route buttons: ${snapshot.missingRouteButtons.join(", ")}`);
  assert(snapshot.unknownRouteButtons.length === 0, `Unknown route buttons: ${snapshot.unknownRouteButtons.join(", ")}`);
  assert(snapshot.missingMounts.length === 0, `Missing mount bindings: ${snapshot.missingMounts.join(", ")}`);
  assert(snapshot.missingHooks.length === 0, `Missing action hooks: ${snapshot.missingHooks.join(", ")}`);
  REQUIRED_PANEL_MOUNTS.forEach((mountId) => {
    assert(snapshot.panelMountKeys.includes(mountId), `Missing panel mount in contract: ${mountId}`);
  });
  REQUIRED_ACTION_HOOKS.forEach((hookId) => {
    assert(snapshot.actionHookKeys.includes(hookId), `Missing action hook in contract: ${hookId}`);
  });
}

async function startCampaignFromMenu(page, locationId, seed = "") {
  await page.waitForSelector("#menuRoot:not(.hidden)");
  await page.click("#menuPlayBtn");
  await page.waitForSelector('[data-menu-screen="new_campaign_location_select"]:not(.hidden)');
  await page.click(`[data-menu-location="${locationId}"]`);
  if (seed.length > 0) {
    await page.fill("#menuSeedInput", seed);
  }
  await page.click("#menuStartCampaignBtn");
  await page.waitForSelector("#appShell:not(.hidden)");
}

async function runDesktopSmoke(page) {
  console.log("SMOKE: desktop boot");
  assert(await page.locator("#menuPlayBtn").isVisible(), "Desktop menu missing Play");
  assert(await page.locator("#menuSettingsBtn").isVisible(), "Desktop menu missing Settings");
  await page.click("#menuSettingsBtn");
  await page.waitForSelector('[data-menu-screen="settings_menu"]:not(.hidden)');
  await page.selectOption("#menuDefaultSpeedSelect", "4");
  await page.click("#menuBackFromSettingsBtn");
  await page.waitForSelector('[data-menu-screen="main_menu"]:not(.hidden)');

  await startCampaignFromMenu(page, "meadowbrook", "4242");
  assert(await page.locator("#inGameNav").isVisible(), "Desktop in-game nav missing");
  assert(await page.locator("#alertStrip").isVisible(), "Desktop alert strip missing");

  console.log("SMOKE: desktop route integrity");
  for (const routeId of Object.keys(ROUTE_EXPECTATIONS)) {
    await routeTo(page, routeId);
  }

  console.log("SMOKE: desktop handoff contract");
  await assertUiHandoffContract(page);

  console.log("SMOKE: desktop alert triage");
  const alertCount = await page.locator("#alertStrip .alert-line").count();
  assert(alertCount > 0, "Alert strip did not render queue lines");
  const firstAlertAction = page.locator("#alertStrip button[data-ui-alert-view]").first();
  assert((await firstAlertAction.count()) > 0, "Alert queue missing actionable button");
  const targetRoute = await firstAlertAction.getAttribute("data-ui-alert-view");
  await firstAlertAction.click();
  await page.waitForTimeout(220);
  if (targetRoute && ROUTE_EXPECTATIONS[targetRoute]) {
    assert(
      (await page.locator(`#inGameNav button[data-ui-route="${targetRoute}"][aria-pressed="true"]`).count()) === 1,
      `Alert action did not jump to route ${targetRoute}`
    );
  }

  console.log("SMOKE: desktop key action reachability");
  await reachAndClick(page, "command", "updatePlanDraftBtn");
  await assertControlReachable(page, "command", "nextDayBtn");
  await reachAndClick(page, "world", "fileComplianceBtn");
  await reachAndClick(page, "operations", "brewAleBtn");
  await reachAndClick(page, "staff", "hireServerBtn");

  await routeTo(page, "reports");
  await page.click("#reportTabWeeklyBtn");
  assert(await page.locator("#reportWeeklyView").isVisible(), "Weekly tab not visible");
  await page.click("#reportTabLogBtn");
  await page.selectOption("#logToneSelect", "bad");
  await page.fill("#reportFilterInput", "crown");
  assert(await page.locator("#logView").isVisible(), "Log tab not visible");

  console.log("SMOKE: desktop keyboard routes");
  await page.click('#inGameNav button[data-ui-route="reports"]');
  await page.keyboard.press("[");
  await page.waitForTimeout(220);
  assert(
    (await page.locator('#inGameNav button[data-ui-route="analytics"][aria-pressed="true"]').count()) === 1,
    "Bracket route cycle did not activate analytics route"
  );
  await page.keyboard.press("/");
  const activeElementId = await page.evaluate(() => {
    const active = document.activeElement;
    return active ? active.id : "";
  });
  assert(activeElementId === "reportFilterInput", "Slash shortcut did not focus report search");
}

async function runMobileSmoke(page) {
  console.log("SMOKE: mobile boot");
  await startCampaignFromMenu(page, "arcanum");
  assert(await page.locator("#inGameNav").isVisible(), "Mobile in-game nav missing");
  assert(await page.locator("#alertStrip").isVisible(), "Mobile alert strip missing");

  const navPosition = await page.evaluate(() => {
    const nav = document.getElementById("inGameNav");
    return nav ? window.getComputedStyle(nav).position : "";
  });
  assert(navPosition === "sticky", `Mobile nav should be sticky, got ${navPosition}`);

  console.log("SMOKE: mobile route reachability");
  for (const routeId of Object.keys(ROUTE_EXPECTATIONS)) {
    await routeTo(page, routeId);
  }

  await assertControlReachable(page, "command", "nextDayBtn");
  await reachAndClick(page, "world", "fileComplianceBtn");
  await reachAndClick(page, "staff", "hireServerBtn");

  const mobileAlertAction = page.locator("#alertStrip button[data-ui-alert-view]").first();
  assert((await mobileAlertAction.count()) > 0, "Mobile alert action button missing");
  await mobileAlertAction.click();
  await page.waitForTimeout(220);
}

async function main() {
  const server = createStaticServer(ROOT);
  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Unable to resolve dynamic port."));
        return;
      }
      resolve(address.port);
    });
  });

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const desktopPage = await desktop.newPage();
    desktopPage.setDefaultTimeout(15000);
    await dismissDialogs(desktopPage);
    await desktopPage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
    await desktopPage.evaluate(() => localStorage.clear());
    await desktopPage.reload({ waitUntil: "domcontentloaded" });
    await runDesktopSmoke(desktopPage);
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobile.newPage();
    mobilePage.setDefaultTimeout(15000);
    await dismissDialogs(mobilePage);
    await mobilePage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
    await mobilePage.evaluate(() => localStorage.clear());
    await mobilePage.reload({ waitUntil: "domcontentloaded" });
    await runMobileSmoke(mobilePage);
    await mobile.close();

    console.log("BROWSER_SMOKE_PASS: desktop+mobile routing, alert triage, and core action reachability validated.");
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
