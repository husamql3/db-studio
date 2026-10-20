// Server only: reads and writes the SPONSORS KV namespace.
import { env } from "cloudflare:workers";
import type { Sponsor } from "@/lib/content/sponsors";

const LIST_KEY = "sponsors";
const logoKey = (id: string) => `logo:${id}`;

export const readSponsors = async (): Promise<Sponsor[]> =>
	(await env.SPONSORS.get<Sponsor[]>(LIST_KEY, "json")) ?? [];

export const writeSponsors = (sponsors: Sponsor[]) =>
	env.SPONSORS.put(LIST_KEY, JSON.stringify(sponsors));

export const readLogo = (id: string) =>
	env.SPONSORS.getWithMetadata<{ type: string }>(logoKey(id), "arrayBuffer");

export const writeLogo = async (id: string, file: File) =>
	env.SPONSORS.put(logoKey(id), await file.arrayBuffer(), { metadata: { type: file.type } });

export const deleteLogo = (id: string) => env.SPONSORS.delete(logoKey(id));
