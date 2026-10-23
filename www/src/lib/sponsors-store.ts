// Server only: reads the SPONSORS KV namespace. avocado-admin owns the writes,
// so keep the keys in step with it.
import { env } from "cloudflare:workers";
import type { Sponsor } from "@/lib/content/sponsors";

export const readSponsors = async (): Promise<Sponsor[]> =>
	(await env.SPONSORS.get<Sponsor[]>("sponsors", "json")) ?? [];

export const readLogo = (id: string) =>
	env.SPONSORS.getWithMetadata<{ type: string }>(`logo:${id}`, "arrayBuffer");
