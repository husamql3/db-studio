/**
 * Before/after screenshots for the UI v2 pass. Each shot drives one interaction and captures
 * either its resting state or a frozen frame partway through its animation, so a change to
 * easing, duration, press feedback or radius shows up as a diff between two labelled runs.
 *
 * Frames are frozen through the DevTools Animation domain (playback rate 0), then the opened
 * overlay's animations are seeked to the same time, so a "40ms" frame is the same frame on every
 * run.
 *
 *   DB_PATH=/tmp/ui-v2.sqlite bun run init-db:sqlite        # from the repo root
 *   cd packages/web && bun run build && cd ../server && bun run build
 *   NODE_ENV=development DB_STUDIO_TELEMETRY=0 DB_STUDIO_CONFIG_DIR=/tmp/ui-v2-config \
 *     node dist/index.js --no-open -p 4530 -d sqlite:///tmp/ui-v2.sqlite
 *   bunx tsx e2e/ui-v2-shots.ts <label> [shot ...]
 *
 * NODE_ENV=development serves ../web/dist, so rebuilding the web app is enough between runs.
 * Writes e2e/artifacts/ui-v2/<label>/<shot>.png.
 */
import { mkdir } from "node:fs/promises";
import { type CDPSession, chromium, type Page } from "playwright-core";

const BASE = process.env.UI_SHOTS_BASE ?? "http://127.0.0.1:4530";
const [label, ...only] = process.argv.slice(2);
if (!label) throw new Error("Usage: ui-v2-shots.ts <label> [shot ...]");
const outDir = new URL(`./artifacts/ui-v2/${label}/`, import.meta.url);
await mkdir(outDir, { recursive: true });

type Clip = { x: number; y: number; width: number; height: number };
type Shot = (page: Page, cdp: CDPSession) => Promise<Clip | undefined>;

/** Lets animations already running (the sidebar sliding in on load) end, then stops the clock. */
const freeze = async (page: Page, cdp: CDPSession) => {
	await page.waitForFunction(() =>
		document
			.getAnimations()
			.every(
				(a) => a.playState !== "running" || a.effect?.getComputedTiming().endTime === Infinity,
			),
	);
	await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
};
/** Seeks the overlay's animations to `ms` and finishes every other finite one. */
const seek = async (page: Page, ms: number) => {
	await page.waitForTimeout(50);
	await page.evaluate((t) => {
		for (const animation of document.getAnimations()) {
			const target = (animation.effect as KeyframeEffect | null)?.target;
			if (target?.closest("[data-slot$='-content'], [data-slot$='-overlay']")) {
				animation.currentTime = t;
			} else if (animation.effect?.getComputedTiming().endTime !== Infinity) {
				animation.finish();
			}
		}
	}, ms);
};
const around = async (
	page: Page,
	selector: string,
	pad: Partial<Clip> = {},
): Promise<Clip> => {
	const box = await page.locator(selector).first().boundingBox();
	if (!box) throw new Error(`No box for ${selector}`);
	return {
		x: Math.max(0, box.x - (pad.x ?? 16)),
		y: Math.max(0, box.y - (pad.y ?? 16)),
		width: box.width + (pad.width ?? 260),
		height: box.height + (pad.height ?? 220),
	};
};
const openTable = (page: Page) =>
	page
		.goto(`${BASE}/table/employees?db=main`)
		.then(() => page.getByText("Bob Santos").waitFor());

const openSidebarMenu = async (page: Page, beforeClick?: () => Promise<unknown>) => {
	await openTable(page);
	const link = page.locator("a[href='/table/employees']", { hasText: "employees" });
	await link.hover();
	await beforeClick?.();
	await page
		.locator("div")
		.filter({ has: link })
		.last()
		.locator("[data-slot=dropdown-menu-trigger]")
		.click();
};
const openRowsMenu = (page: Page) =>
	openTable(page).then(() => page.getByLabel("Choose preset row count").click());

const shots: Record<string, Shot> = {
	"toolbar-press": async (page) => {
		await openTable(page);
		await page.getByRole("button", { name: "Add Record" }).hover();
		await page.mouse.down();
		await page.waitForTimeout(250);
		return { x: 348, y: 0, width: 300, height: 32 };
	},
	"sidebar-menu-40ms": async (page, cdp) => {
		await openSidebarMenu(page, () => freeze(page, cdp));
		await seek(page, 40);
		return around(page, "[data-slot=dropdown-menu-trigger][data-state=open]", {
			width: 300,
			height: 260,
		});
	},
	"sidebar-menu-open": async (page) => {
		await openSidebarMenu(page);
		await page.waitForTimeout(400);
		return around(page, "[data-slot=dropdown-menu-trigger][data-state=open]", {
			width: 300,
			height: 260,
		});
	},
	"rows-menu-40ms": async (page, cdp) => {
		await freeze(page, cdp);
		await openRowsMenu(page);
		await seek(page, 40);
		return { x: 348, y: 560, width: 260, height: 340 };
	},
	"folder-context-menu": async (page) => {
		await page.goto(`${BASE}/runner`);
		await page.getByRole("button", { name: "Add Folder" }).click();
		await page.getByText("New Folder", { exact: true }).click({ button: "right" });
		await page.getByRole("menuitem", { name: "Rename folder" }).hover();
		await page.waitForTimeout(400);
		return around(page, "[data-slot=context-menu-content]", {
			x: 24,
			y: 24,
			width: 48,
			height: 48,
		});
	},
	"tooltip-first-120ms": async (page) => {
		await openTable(page);
		await page.getByRole("link", { name: "runner" }).hover();
		await page.waitForTimeout(120);
		return { x: 0, y: 40, width: 220, height: 200 };
	},
	"tooltip-next-30ms": async (page, cdp) => {
		await openTable(page);
		await page.getByRole("link", { name: "runner" }).hover();
		await page.waitForTimeout(800);
		const next = await page.getByRole("link", { name: "schema" }).boundingBox();
		if (!next) throw new Error("No schema link");
		await freeze(page, cdp);
		// A real pointer crosses the gap in many moves; one jump leaves Radix's grace area armed.
		await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2, { steps: 8 });
		await seek(page, 30);
		return { x: 0, y: 40, width: 220, height: 200 };
	},
	"command-palette-50ms": async (page, cdp) => {
		await openTable(page);
		await freeze(page, cdp);
		await page.keyboard.press("Meta+k");
		await seek(page, 50);
		return undefined;
	},
	"add-record-menu-40ms": async (page, cdp) => {
		await openTable(page);
		await freeze(page, cdp);
		await page.getByRole("button", { name: "Add Record" }).click();
		await seek(page, 40);
		return { x: 348, y: 0, width: 420, height: 200 };
	},
	"add-record-sheet-80ms": async (page, cdp) => {
		await openTable(page);
		await page.getByRole("button", { name: "Add Record" }).click();
		await page.getByRole("menuitem", { name: "Add Record" }).waitFor();
		await freeze(page, cdp);
		await page.getByRole("menuitem", { name: "Add Record" }).click();
		await seek(page, 80);
		return undefined;
	},
	"settings-sheet-80ms": async (page, cdp) => {
		await openTable(page);
		await freeze(page, cdp);
		await page.getByLabel("Open settings").click();
		await seek(page, 80);
		return undefined;
	},
	"settings-sheet-open": async (page) => {
		await openTable(page);
		await page.getByLabel("Open settings").click();
		await page.waitForTimeout(500);
		return undefined;
	},
	"more-hover": async (page) => {
		await openTable(page);
		await page.getByLabel("More").hover();
		await page.waitForTimeout(600);
		return { x: 0, y: 740, width: 220, height: 160 };
	},
	"add-record-field-joint": async (page) => {
		await openTable(page);
		await page.getByRole("button", { name: "Add Record" }).click();
		await page.getByRole("menuitem", { name: "Add Record" }).click();
		await page.waitForTimeout(500);
		return around(page, "[aria-label='Go to table']", {
			x: 300,
			y: 12,
			width: 316,
			height: 24,
		});
	},
	"json-import-tabs": async (page) => {
		await openTable(page);
		await page.getByRole("button", { name: "Add Record" }).click();
		await page.getByRole("menuitem", { name: "Add data from JSON" }).click();
		await page.waitForTimeout(500);
		return around(page, "[role=tablist]", { x: 24, y: 24, width: 48, height: 48 });
	},
	"delete-dialog-60ms": async (page, cdp) => {
		await openSidebarMenu(page);
		await page.getByRole("menuitem", { name: "Delete table" }).waitFor();
		await page.waitForTimeout(300);
		await freeze(page, cdp);
		await page.getByRole("menuitem", { name: "Delete table" }).click();
		await seek(page, 60);
		return undefined;
	},
};

const browser = await chromium.launch({
	channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
});
let failed = false;
for (const [name, shot] of Object.entries(shots)) {
	if (only.length > 0 && !only.includes(name)) continue;
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		colorScheme: "dark",
	});
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Animation.enable");
	try {
		const clip = await shot(page, cdp);
		await page.screenshot({ path: new URL(`${name}.png`, outDir).pathname, clip });
		console.log(`PASS ${name}`);
	} catch (error) {
		failed = true;
		console.log(`FAIL ${name}: ${(error as Error).message.split("\n")[0]}`);
	}
	await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
