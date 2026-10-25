// Server only: reads the SPONSORS KV namespace. avocado-admin owns the writes,
// so keep the keys in step with it.
import { env } from "cloudflare:workers";
import type { Sponsor } from "@/lib/content/sponsors";

// A failed read hides the sponsors instead of failing the whole homepage.
export const readSponsors = (): Promise<Sponsor[]> =>
	env.SPONSORS.get<Sponsor[]>("sponsors", "json").then(
		(sponsors) => sponsors ?? [],
		(error) => {
			console.error("Sponsors could not be read from KV", error);
			return [];
		},
	);

export const readLogo = (id: string) =>
	env.SPONSORS.getWithMetadata<{ type: string }>(`logo:${id}`, "arrayBuffer");
