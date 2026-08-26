type Frontmatter = {
	title?: string;
	description?: string;
};

const parseFrontmatter = (raw: string): { frontmatter: Frontmatter; body: string } => {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { frontmatter: {}, body: raw };

	const frontmatter: Frontmatter = {};
	for (const line of match[1].split(/\r?\n/)) {
		const [key, ...rest] = line.split(":");
		const value = rest
			.join(":")
			.trim()
			.replace(/^["']|["']$/g, "");
		if (key?.trim() === "title") frontmatter.title = value;
		if (key?.trim() === "description") frontmatter.description = value;
	}
	return { frontmatter, body: raw.slice(match[0].length) };
};

// Matches lines that are purely MDX component tags, e.g. <Cards>, </Card>,
// <CodeBlockTab value="npx">, or single-line elements like
// <CodeBlockTabsTrigger value="npx">npx</CodeBlockTabsTrigger>.
const COMPONENT_TAG_LINE = /^[ \t]*<\/?[A-Z][^>]*>[ \t]*$/;
const COMPONENT_INLINE_LINE = /^[ \t]*(<[A-Z][^>]*>[^<>]*<\/[A-Z][A-Za-z]*>[ \t]*)+$/;
const TITLED_COMPONENT_OPEN =
	/^[ \t]*<(Card|Accordion|Callout)\b[^>]*\btitle="([^"]*)"[^>]*>[ \t]*$/;

/**
 * Converts a Fumadocs MDX document into plain markdown that renders
 * sensibly without JSX: strips frontmatter (re-emitting the title as an
 * `# h1` when the body has none), turns titled components (Card,
 * Accordion, Callout) into headings, drops the remaining component tags,
 * and dedents code fences that were nested inside components.
 */
export const mdxToMarkdown = (raw: string): string => {
	const { frontmatter, body } = parseFrontmatter(raw);

	const out: string[] = [];
	let fenceIndent = "";
	let inFence = false;
	let hasH1 = false;

	for (const line of body.split("\n")) {
		const fenceMatch = line.match(/^([ \t]*)(```|~~~)/);
		if (fenceMatch) {
			if (!inFence) fenceIndent = fenceMatch[1];
			inFence = !inFence;
			out.push(line.startsWith(fenceIndent) ? line.slice(fenceIndent.length) : line);
			continue;
		}
		if (inFence) {
			out.push(line.startsWith(fenceIndent) ? line.slice(fenceIndent.length) : line);
			continue;
		}

		const titled = line.match(TITLED_COMPONENT_OPEN);
		if (titled) {
			out.push(titled[1] === "Callout" ? `> **${titled[2]}**` : `### ${titled[2]}`);
			continue;
		}
		if (COMPONENT_TAG_LINE.test(line) || COMPONENT_INLINE_LINE.test(line)) continue;

		if (line.startsWith("# ")) hasH1 = true;
		// Component bodies are indented; dedent so they don't render as code.
		out.push(/^[ \t]{4,}\S/.test(line) ? line.replace(/^[ \t]+/, "") : line);
	}

	let markdown = out
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	const header = [
		!hasH1 && frontmatter.title ? `# ${frontmatter.title}` : null,
		frontmatter.description ?? null,
	].filter(Boolean);
	if (header.length > 0) markdown = `${header.join("\n\n")}\n\n${markdown}`;

	return `${markdown}\n`;
};
