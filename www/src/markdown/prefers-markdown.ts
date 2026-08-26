const MARKDOWN_TYPES = new Set(["text/markdown", "text/x-markdown"]);
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);

/**
 * Returns true when the Accept header explicitly requests markdown at a
 * quality equal to or higher than HTML. Wildcards (`*` / `text/*`) never
 * count as a markdown request, so browsers always keep getting HTML.
 */
export const prefersMarkdown = (accept: string | null): boolean => {
	if (!accept) return false;

	let markdownQ = 0;
	let htmlQ = 0;

	for (const part of accept.split(",")) {
		const [rawType, ...params] = part.split(";");
		const type = rawType?.trim().toLowerCase();
		if (!type) continue;

		let q = 1;
		for (const param of params) {
			const [key, value] = param.split("=");
			if (key?.trim().toLowerCase() === "q") {
				const parsed = Number.parseFloat(value ?? "");
				if (!Number.isNaN(parsed)) q = parsed;
			}
		}

		if (MARKDOWN_TYPES.has(type)) markdownQ = Math.max(markdownQ, q);
		if (HTML_TYPES.has(type)) htmlQ = Math.max(htmlQ, q);
	}

	return markdownQ > 0 && markdownQ >= htmlQ;
};
