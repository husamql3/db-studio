import { changelog } from "../www/src/lib/content/changelog.ts";

const version = process.argv[2];

if (!version) {
	console.error("Usage: bun scripts/generate-release-notes.ts <version>");
	process.exit(1);
}

const entry = changelog.find((item) => item.version === version);

if (!entry) {
	console.error(`Version ${version} not found in changelog`);
	process.exit(1);
}

const lines = [];

if (entry.features?.length) {
	lines.push("## Features");
	for (const f of entry.features) {
		const credit = f.username
			? ` — @${Array.isArray(f.username) ? f.username.join(", @") : f.username}`
			: "";
		lines.push(`- ${f.text}${credit}`);
	}
}

if (entry.improvements?.length) {
	lines.push("");
	lines.push("## Improvements");
	for (const i of entry.improvements) {
		const credit = i.username
			? ` — @${Array.isArray(i.username) ? i.username.join(", @") : i.username}`
			: "";
		lines.push(`- ${i.text}${credit}`);
	}
}

if (entry.bugsFixed?.length) {
	lines.push("");
	lines.push("## Bug Fixes");
	for (const b of entry.bugsFixed) {
		const credit = b.username
			? ` — @${Array.isArray(b.username) ? b.username.join(", @") : b.username}`
			: "";
		lines.push(`- ${b.text}${credit}`);
	}
}

console.log(lines.join("\n"));
