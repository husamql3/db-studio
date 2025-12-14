import { neonConfig, Pool } from "@neondatabase/serverless";

// Enable fetch for Cloudflare Workers
neonConfig.fetchFunction = fetch;

// Use the DATABASE_URL from wrangler.jsonc vars
// In Cloudflare Workers, environment variables are available globally
export const db = new Pool({
	connectionString:
		"postgresql://flowx_owner:npg_0J7WmlUPpCug@ep-round-heart-a4t1tt2e-pooler.us-east-1.aws.neon.tech/flowx?sslmode=require",
});
