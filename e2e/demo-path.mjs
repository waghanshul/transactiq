// End-to-end check of the 7-minute demo path (S4-09).
// Usage: BASE_URL=https://your-app.vercel.app node e2e/demo-path.mjs
// Needs Playwright with Chromium: npm i -D playwright && npx playwright install chromium
// It changes demo data (approves one repair); reset the demo afterwards if needed.
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const step = (n, msg) => console.log(`${String(n).padStart(2)}. ${msg}`);
const fail = (msg) => { console.error(`FAILED: ${msg}`); process.exitCode = 1; throw new Error(msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Visible text only: textContent would also match Next's streamed RSC payload in <script> tags.
const text = () => page.locator("main").innerText();
const waitText = (t, timeout = 30_000) =>
  page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), t, { timeout });
const signIn = async (id, next) => {
  await page.goto(`${BASE}/sign-in?next=${encodeURIComponent(next)}`);
  await page.locator(`form:has(input[value="${id}"]) button`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
};

try {
  const health = await (await page.request.get(`${BASE}/api/health`)).json();
  if (!health.ok) fail(`health check: ${health.error}`);
  step(1, `Database awake (${health.dbMs} ms), ${health.payments} payments`);

  await page.goto(`${BASE}/queue`);
  await page.waitForFunction(() => /Run pre-send checks|Passed, ready to send/.test(document.body.innerText), null, { timeout: 30_000 });
  if ((await text()).toLowerCase().includes("run pre-send checks")) {
    await page.getByRole("button", { name: "Run pre-send checks" }).click();
    await waitText("Passed, ready to send", 60_000);
  }
  const stats = (await page.locator("section[aria-label]").innerText()).replace(/\s+/g, " ");
  step(2, `The cliff: ${stats}`);
  if (!/Held as possible duplicates/.test(stats) || !/Sent to compliance/.test(stats)) fail("queue stats missing");

  await signIn("maker@demo", "/queue?tab=prevent&bucket=1");
  await waitText("Filter by problem");
  const links = await page.locator("main ul li a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  let easy, hard;
  for (const href of links) {
    await page.goto(BASE + href);
    await waitText("In the message now");
    const t = (await text()).toLowerCase();
    if (!hard && t.includes("not sure enough to suggest")) hard = href;
    if (!easy && /pune/.test(t) && (await page.getByRole("button", { name: "Accept" }).count()) > 0) easy = href;
    if (easy && hard) break;
  }
  if (!easy) fail("no Pune address suggestion found");
  step(3, `Easy win: ${easy}`);
  await page.goto(BASE + easy);
  await page.getByRole("button", { name: "Accept" }).first().click();
  await waitText("All 22 checks pass");
  await page.getByRole("button", { name: /^Submit/ }).click();
  await waitText("Waiting for checker");
  step(4, "Maker accepted the suggestion, re-validation passed, submitted");

  if (!hard) fail("no low-confidence hard case found");
  await page.goto(BASE + hard);
  await waitText("Possible:").catch(() => fail("hard case shows no options"));
  step(5, `Honest hard case: ${hard} shows options, not a guess`);

  await page.goto(`${BASE}/queue?tab=prevent&bucket=3`);
  await page.locator("main ul li a").first().click();
  await waitText("Ask the client");
  step(6, "Never guess money: account problem drafts a client message");

  await signIn("checker@demo", "/queue?tab=approval");
  await waitText("Waiting for approval");
  await page.locator("main ul li a").first().click();
  await waitText("Approve");
  await page.getByRole("button", { name: "Approve" }).click();
  await waitText("Repair approved");
  await page.goto(`${BASE}${easy}?tab=audit`);
  await waitText("Accepted a suggestion").catch(() => fail("audit trail incomplete"));
  await waitText("pending_check → approved").catch(async () => fail(`audit trail has no approval: ${(await text()).slice(0, 400)}`));
  step(7, "Checker approved; audit trail shows both people");

  await page.goto(`${BASE}/insights`);
  await waitText("By client");
  await page.goto(`${BASE}/metrics`);
  await waitText("Payments released automatically", 60_000);
  const guard = await page.locator("section:has(h2:text('Guardrails')) li").allTextContents();
  if (guard.some((g) => !/0\s*$/.test(g.trim()))) fail(`a guardrail is not zero: ${guard.join(" | ")}`);
  step(8, "Insights and Metrics load; every guardrail is at zero");

  if (errors.length) fail(`browser errors: ${errors.join("; ")}`);
  console.log("\nDemo path OK.");
} catch (e) {
  if (!process.exitCode) { console.error(e); process.exitCode = 1; }
} finally {
  await browser.close();
}
