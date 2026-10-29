import rawDocs from "virtual:raw-docs";
import { type ChangelogEntry, changelog } from "@/lib/content/changelog";
import { supportedDatabases } from "@/lib/content/databases";
import { roadmapItems } from "@/lib/content/roadmap";
import { SPONSOR_EMAIL, type Sponsor, sponsorTiers } from "@/lib/content/sponsors";
import { readSponsors } from "@/lib/sponsors-store";
import { mdxToMarkdown } from "./mdx-to-markdown";

const SITE_URL = "https://dbstudio.sh";

const docsMarkdown = new Map<string, string>();
for (const [slug, raw] of Object.entries(rawDocs)) {
	docsMarkdown.set(slug === "index" ? "/docs" : `/docs/${slug}`, mdxToMarkdown(raw));
}

const changelogEntryLine = ({ text, username }: ChangelogEntry): string => {
	const usernames = username ? (Array.isArray(username) ? username : [username]) : [];
	const credit = usernames.map((u) => `[@${u}](https://github.com/${u})`).join(", ");
	return `- ${text}${credit ? ` — ${credit}` : ""}`;
};

const changelogMarkdown = (): string => {
	const sections = changelog.map((item) => {
		const lines = [`## v${item.version} — ${item.title} (${item.date})`];
		if (item.tags?.length) lines.push(`Tags: ${item.tags.join(", ")}`);
		if (item.image) lines.push(`![v${item.version}](${SITE_URL}${item.image})`);
		if (item.features?.length)
			lines.push("### Features", item.features.map(changelogEntryLine).join("\n"));
		if (item.improvements?.length)
			lines.push("### Improvements", item.improvements.map(changelogEntryLine).join("\n"));
		if (item.bugsFixed?.length)
			lines.push("### Bug fixes", item.bugsFixed.map(changelogEntryLine).join("\n"));
		return lines.join("\n\n");
	});

	return `# Changelog\n\nRelease history for db-studio.\n\n${sections.join("\n\n")}\n`;
};

const roadmapMarkdown = (): string => {
	const sections = roadmapItems.map((section) => {
		const tasks = section.items
			.map(
				(task) =>
					`- [${task.status === "completed" ? "x" : " "}] ${task.title}${
						task.status === "in-progress" ? " _(in progress)_" : ""
					}`,
			)
			.join("\n");
		return `## ${section.title} (${section.status})\n\n${tasks}`;
	});

	return `# Roadmap\n\nWhat's done, in progress, and planned for db-studio.\n\n${sections.join("\n\n")}\n`;
};

const landingMarkdown = (sponsors: Sponsor[]): string => `# db-studio

A modern (pgAdmin alternative but good) database management studio for any database.

## Getting Started

Launch instantly from your terminal, no installation needed:

\`\`\`bash
npx db-studio    # or: yarn dlx db-studio / pnpm dlx db-studio / bunx db-studio
\`\`\`

## Works with your stack

${supportedDatabases
	.map(
		({ name, slug, scheme }) =>
			`- [${name}](${SITE_URL}/docs/databases#${slug}) — \`${scheme}\``,
	)
	.join("\n")}

## Everything you need to manage your database

- **Zero Installation** — Launch instantly with a single npx command. No setup required.
- **Multi-Database** — PostgreSQL, MySQL, SQL Server, MongoDB, SQLite, Redis, DuckDB, Oracle, ClickHouse, and more from one UI.
- **Table Browser** — Browse, filter, sort, and paginate rows. Full CRUD without writing SQL.
- **Query Editor** — Monaco-powered SQL editor with syntax highlighting built right in.
- **Saved Connections** — Every database you open is remembered. Switch, rename, and color connections without leaving the app.
- **AI Assistant** — Ask about your schema and draft queries in chat, with your own AI provider key.

## Links

- [Documentation](${SITE_URL}/docs)
- [Getting Started](${SITE_URL}/docs/getting-started)
- [Desktop App](${SITE_URL}/docs/desktop)
- [FAQ](${SITE_URL}/docs/faq)
- [Roadmap](${SITE_URL}/roadmap)
- [Changelog](${SITE_URL}/changelog)
- [GitHub](https://github.com/husamql3/db-studio)

## Sponsors

${sponsorTiers
	.map(({ id, label, price, spots }) => {
		const inTier = sponsors.filter((s) => s.tier === id);
		return `- **${label}** (${price}, ${Math.max(0, spots - inTier.length)} of ${spots} open)${inTier.map((s) => `\n  - [${s.name}](${s.url})`).join("")}`;
	})
	.join("\n")}

Interested in sponsoring db-studio? Reach out at ${SPONSOR_EMAIL}
`;

/**
 * Markdown version of every public page, keyed by pathname.
 * Returns null for paths that have no markdown representation.
 */
export const getMarkdownForPath = async (pathname: string): Promise<string | null> => {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

	if (path === "/") return landingMarkdown(await readSponsors());
	if (path === "/changelog") return changelogMarkdown();
	if (path === "/roadmap") return roadmapMarkdown();
	return docsMarkdown.get(path) ?? null;
};
