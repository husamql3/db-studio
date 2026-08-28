/**
 * Generates the environment favicon variants from the base icon.
 *
 * Re-run whenever public/favicon.png (the base logo) changes:
 *   bun run generate:favicons
 *
 * Outputs (checked in):
 *   public/favicon-dev.png   — green dot, used by `vite dev`
 *   public/favicon-stage.png — yellow dot, used by `vite build --mode staging`
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const basePath = path.join(publicDir, "favicon.png");

const VARIANTS = [
	{ file: "favicon-dev.png", color: "#22c55e" },
	{ file: "favicon-stage.png", color: "#eab308" },
] as const;

const { width, height } = await sharp(basePath).metadata();
if (!width || !height) throw new Error(`Could not read dimensions of ${basePath}`);

// Dot sized ~35% of the icon width, tucked inside the rounded corner so it
// stays on the black background rather than the transparent corner cut.
const radius = Math.round(width * 0.175);
const stroke = Math.round(width * 0.024);
const center = Math.round(width * 0.765);

for (const { file, color } of VARIANTS) {
	const overlay = Buffer.from(
		`<svg width="${width}" height="${height}">
			<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}" stroke="#000000" stroke-width="${stroke}" />
		</svg>`,
	);
	const outPath = path.join(publicDir, file);
	await sharp(basePath)
		.composite([{ input: overlay }])
		.png()
		.toFile(outPath);
	console.log(`wrote ${outPath}`);
}
