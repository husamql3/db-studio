import type { DatabaseEngine } from "@db-studio/shared/types";

export const PLACEHOLDER_QUERIES: Record<DatabaseEngine["editorLanguage"], string> = {
	pgsql: `-- Your query here...
`,
	json: `{
  "collection": "your_collection",
  "operation": "find",
  "filter": {},
  "sort": { "_id": 1 },
  "limit": 50
}`,
	plaintext: "PING",
};
