import { describe, expect, it } from "vitest";
import { mdxToMarkdown } from "./mdx-to-markdown";

describe("mdxToMarkdown", () => {
	it("keeps shorter and different fence markers inside a longer code fence", () => {
		const markdown = mdxToMarkdown(
			[
				"---",
				"title: Fences",
				"---",
				"",
				"````mdx",
				"<Card>",
				"```",
				"</Card>",
				"````",
				"",
				'<Card title="Outside">',
				"body",
				"</Card>",
			].join("\n"),
		);

		expect(markdown).toContain("````mdx\n<Card>\n```\n</Card>\n````");
		expect(markdown).toContain("### Outside\nbody");
	});
});
