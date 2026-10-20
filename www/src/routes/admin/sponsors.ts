import { createFileRoute } from "@tanstack/react-router";
import { type Sponsor, sponsorTiers } from "@/lib/content/sponsors";
import { deleteLogo, readSponsors, writeLogo, writeSponsors } from "@/lib/sponsors-store";

const LOGO_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 512 * 1024;

/** Back to the admin page, with the error to show when there is one. */
const backToAdmin = (error?: string) =>
	new Response(null, {
		status: 303,
		// Relative, so it stays on the host the browser used (the dev proxy rewrites request.url).
		headers: { location: error ? `/admin?${new URLSearchParams({ error })}` : "/admin" },
	});

const isHttpUrl = (value: string) => {
	try {
		return ["http:", "https:"].includes(new URL(value).protocol);
	} catch {
		return false;
	}
};

// src/admin-auth.ts lets only a signed-in admin reach this.
export const Route = createFileRoute("/admin/sponsors")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const form = await request.formData();
				const sponsors = await readSponsors();

				if (form.get("action") === "remove") {
					const id = String(form.get("id"));
					await writeSponsors(sponsors.filter((s) => s.id !== id));
					await deleteLogo(id);
					return backToAdmin();
				}

				const name = String(form.get("name") ?? "").trim();
				const url = String(form.get("url") ?? "").trim();
				const tier = sponsorTiers.find((t) => t.id === form.get("tier"))?.id;
				const logo = form.get("logo");
				const file = logo instanceof File && logo.size > 0 ? logo : null;

				if (!name) return backToAdmin("Enter a name.");
				if (!isHttpUrl(url)) return backToAdmin("Enter a link that starts with https://.");
				if (!tier) return backToAdmin("Pick a tier.");
				if (file && !LOGO_TYPES.includes(file.type)) {
					return backToAdmin("Upload the logo as SVG, PNG, JPEG or WebP.");
				}
				if (file && file.size > MAX_LOGO_BYTES) {
					return backToAdmin("Upload a logo under 512 KB.");
				}

				const sponsor: Sponsor = { id: crypto.randomUUID().slice(0, 8), name, url, tier };
				if (file) {
					await writeLogo(sponsor.id, file);
					sponsor.logo = Date.now();
				}
				await writeSponsors([...sponsors, sponsor]);
				return backToAdmin();
			},
		},
	},
});
