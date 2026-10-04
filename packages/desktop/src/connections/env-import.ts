import type { EnvConnectionCandidateSchemaType } from "@db-studio/shared/types";
import { describeConnectionUrl } from "./describe-url";

/**
 * Parses dotenv-style text and returns every entry whose value is a database URL the
 * server can connect to. Mirrors the CLI's `.env` discovery, but lets the user pick.
 */
export const parseEnvCandidates = (text: string): EnvConnectionCandidateSchemaType[] => {
	const candidates: EnvConnectionCandidateSchemaType[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) continue;
		const [, name, rawValue] = match;
		if (!name || rawValue === undefined) continue;
		const value = unquote(rawValue);
		if (!value) continue;
		try {
			describeConnectionUrl(value);
			candidates.push({ name, url: value });
		} catch {}
	}
	return candidates;
};

const unquote = (value: string): string => {
	const trimmed = value.trim();
	const quoted = trimmed.match(/^(["'`])(.*)\1$/);
	if (quoted?.[2] !== undefined) return quoted[2];
	// Unquoted values end at the first ` #` comment marker.
	return trimmed.replace(/\s+#.*$/, "");
};
