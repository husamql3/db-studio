/**
 * Before/after screenshots of the marketing site (www). Reduced motion keeps the demo video on its
 * first frame and stops the WebGL backdrops, so two runs of the same build match.
 *
 *   cd www && PORT=3100 bun run dev:app
 *   cd packages/server && bunx tsx e2e/www-shots.ts <label> [shot ...]
 *
 * Writes e2e/artifacts/www/<label>/<shot>.png.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const BASE = process.env.WWW_BASE ?? "http://127.0.0.1:3100";
const [label, ...only] = process.argv.slice(2);
if (!label) throw new Error("Usage: www-shots.ts <label> [shot ...]");
const outDir = new URL(`./artifacts/www/${label}/`, import.meta.url);
await mkdir(outDir, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const shots = [
	{ name: "home", path: "/", viewport: DESKTOP, fullPage: true },
	{ name: "home-mobile", path: "/", viewport: MOBILE, fullPage: true },
	{ name: "changelog", path: "/changelog", viewport: DESKTOP, fullPage: false },
	{ name: "roadmap", path: "/roadmap", viewport: DESKTOP, fullPage: true },
	{ name: "docs", path: "/docs/getting-started", viewport: DESKTOP, fullPage: false },
	{ name: "not-found", path: "/nope", viewport: DESKTOP, fullPage: false },
].filter((s) => only.length === 0 || only.includes(s.name));

const browser = await chromium.launch({
	channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
	headless: true,
});
for (const shot of shots) {
	const context = await browser.newContext({
		viewport: shot.viewport,
		deviceScaleFactor: 2,
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(`${BASE}${shot.path}`, { waitUntil: "load", timeout: 60_000 });
	// The TanStack devtools trigger only exists in dev (a goober-styled button around its logo) and
	// mounts late, so a rule hides it whenever it appears.
	await page.addStyleTag({
		content: "body > div:has(button[class^='go'] > img) { display: none !important; }",
	});
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(1500);
	await page.screenshot({
		path: new URL(`${shot.name}.png`, outDir).pathname,
		fullPage: shot.fullPage,
	});
	console.log(`${label}/${shot.name}.png`);
	await context.close();
}
await browser.close();
