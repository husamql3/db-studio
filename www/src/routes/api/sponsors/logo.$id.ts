import { createFileRoute } from "@tanstack/react-router";
import { readLogo } from "@/lib/sponsors-store";

export const Route = createFileRoute("/api/sponsors/logo/$id")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const { value, metadata } = await readLogo(params.id);
				if (!value || !metadata) return new Response("Not found", { status: 404 });
				return new Response(value, {
					headers: {
						"content-type": metadata.type,
						// The URL carries the upload time, so a new logo gets a new URL.
						"cache-control": "public, max-age=31536000, immutable",
						// An uploaded SVG opened on its own must not run script on this origin.
						"content-security-policy":
							"default-src 'none'; style-src 'unsafe-inline'; sandbox",
						"x-content-type-options": "nosniff",
					},
				});
			},
		},
	},
});
