import handler from "@tanstack/react-start/server-entry";
import { getMarkdownForPath } from "./markdown/pages";
import { prefersMarkdown } from "./markdown/prefers-markdown";

const CANONICAL_HOST = "dbstudio.sh";

const markdownResponse = (body: string | null, status: number): Response =>
	new Response(body, {
		status,
		headers: {
			"content-type": "text/markdown; charset=utf-8",
			"cache-control": "public, max-age=300",
			vary: "Accept",
		},
	});

const withVaryAccept = (response: Response): Response => {
	const vary = response.headers.get("vary") ?? "";
	if (
		vary
			.split(",")
			.some((value) => value.trim().toLowerCase() === "accept" || value.trim() === "*")
	) {
		return response;
	}
	const patched = new Response(response.body, response);
	patched.headers.append("vary", "Accept");
	return patched;
};

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// 301 www (and any other non-canonical host alias) to the apex domain
		if (url.hostname !== CANONICAL_HOST && url.hostname.endsWith(`.${CANONICAL_HOST}`)) {
			url.hostname = CANONICAL_HOST;
			return Response.redirect(url.toString(), 301);
		}

		const isPageRequest =
			(request.method === "GET" || request.method === "HEAD") &&
			!url.pathname.startsWith("/api/") &&
			!/\.[a-z0-9]+$/i.test(url.pathname);

		// Content negotiation: agents asking for text/markdown get markdown
		// (Start's SSR handler would otherwise 500 on non-HTML Accept headers).
		if (isPageRequest && prefersMarkdown(request.headers.get("accept"))) {
			const markdown = getMarkdownForPath(url.pathname);
			if (markdown !== null) {
				return markdownResponse(request.method === "HEAD" ? null : markdown, 200);
			}
			return markdownResponse(
				request.method === "HEAD"
					? null
					: `# Not Found\n\nNo page at \`${url.pathname}\`. See ${new URL("/llms.txt", url.origin)} for an index of this site.\n`,
				404,
			);
		}

		const response = await handler.fetch(request);
		return isPageRequest ? withVaryAccept(response) : response;
	},
} satisfies ExportedHandler<Env>;
