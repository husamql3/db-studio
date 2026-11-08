import { createFileRoute } from "@tanstack/react-router";
import { changelog } from "@/lib/content/changelog";

const ORIGIN = "https://dbstudio.sh";

/** `lastmod` is the date the page's content last changed; bump it with substantive edits. */
const PAGES: { path: string; lastmod: string }[] = [
	{ path: "/", lastmod: "2026-10-08" },
	{ path: "/roadmap", lastmod: "2026-10-11" },
	{ path: "/changelog", lastmod: changelog[0].date },
	{ path: "/docs", lastmod: "2026-10-18" },
	{ path: "/docs/getting-started", lastmod: "2026-10-18" },
	{ path: "/docs/desktop", lastmod: "2026-10-29" },
	{ path: "/docs/faq", lastmod: "2026-10-18" },
	{ path: "/docs/databases", lastmod: "2026-10-18" },
	{ path: "/docs/indexes", lastmod: "2026-10-11" },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(({ path, lastmod }) => `  <url>\n    <loc>${ORIGIN}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join("\n")}
</urlset>
`;

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () =>
				new Response(sitemap, {
					headers: {
						"content-type": "application/xml; charset=utf-8",
						"cache-control": "public, max-age=3600",
					},
				}),
		},
	},
});
