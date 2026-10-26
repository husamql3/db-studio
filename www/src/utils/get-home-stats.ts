import { createServerFn } from "@tanstack/react-start";

export type Week = { start: string; count: number };
type NpmRange = { downloads: { downloads: number; day: string }[] };
type Analytics = { pageViews: number; referrers: { name: string; views: number }[] };

const SITE_HOST = "dbstudio.sh";
// The homepage waits for these calls, so a slow API must not hold it up.
const timeout = () => AbortSignal.timeout(3000);

// Last good answers, kept for when an API refuses (GitHub allows 60 unauthenticated calls an hour).
let lastGithub = { stars: 269, forks: 23 };
let lastNpm: NpmRange = { downloads: [] };
let lastNpmTotal: number | null = null;

const getGithub = () =>
	fetch("https://api.github.com/repos/husamql3/db-studio", {
		headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "db-studio-website" },
		signal: timeout(),
		// Cloudflare's edge keeps a good answer for a day; rate-limit errors are never cached.
		cf: { cacheTtlByStatus: { "200-299": 86_400, "400-599": 0 } },
	})
		.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
		.then((json) => {
			const repo = json as { stargazers_count: number; forks_count: number };
			lastGithub = { stars: repo.stargazers_count, forks: repo.forks_count };
			return lastGithub;
		})
		.catch(() => lastGithub);

const getNpm = () =>
	fetch("https://api.npmjs.org/downloads/range/last-year/db-studio", {
		signal: timeout(),
		cf: { cacheTtlByStatus: { "200-299": 3600, "400-599": 0 } },
	})
		.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
		.then((json) => {
			lastNpm = json as NpmRange;
			return lastNpm;
		})
		.catch(() => lastNpm);

async function getNpmTotal(): Promise<number | null> {
	const end = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
	const periods: string[] = [];
	// First publication was 2025-10-28. Split by year to stay below npm's 18-month limit.
	for (let year = 2025; year <= Number(end.slice(0, 4)); year++) {
		const start = year === 2025 ? "2025-10-28" : `${year}-01-01`;
		periods.push(`${start}:${year === Number(end.slice(0, 4)) ? end : `${year}-12-31`}`);
	}

	try {
		const counts = await Promise.all(
			periods.map(async (period) => {
				const response = await fetch(
					`https://api.npmjs.org/downloads/point/${period}/db-studio`,
					{
						signal: timeout(),
						cf: { cacheTtlByStatus: { "200-299": 3600, "400-599": 0 } },
					},
				);
				if (!response.ok) throw new Error(`npm downloads request failed: ${response.status}`);
				const data: unknown = await response.json();
				if (
					typeof data !== "object" ||
					data === null ||
					!("downloads" in data) ||
					typeof data.downloads !== "number" ||
					!Number.isSafeInteger(data.downloads) ||
					data.downloads < 0
				) {
					throw new Error("Invalid npm download count");
				}
				return data.downloads;
			}),
		);
		lastNpmTotal = counts.reduce((sum, count) => sum + count, 0);
	} catch {
		// Keep the last complete total rather than showing a partial count.
	}
	return lastNpmTotal;
}

const ANALYTICS_QUERY = `query ($account: string!, $site: string!, $since: Time!) {
	viewer { accounts(filter: { accountTag: $account }) {
		total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $site, datetime_geq: $since }) { count }
		referrers: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { siteTag: $site, datetime_geq: $since }, orderBy: [count_DESC]) {
			count
			dimensions { refererHost }
		}
	} }
}`;

type AnalyticsResponse = {
	data: {
		viewer: {
			accounts: {
				total: { count: number }[];
				referrers: { count: number; dimensions: { refererHost: string } }[];
			}[];
		};
	} | null;
};

/** Page views and referrers of the last 30 days from Cloudflare Web Analytics, cached for an hour. */
async function getAnalytics(): Promise<Analytics | null> {
	const { CF_ANALYTICS_TOKEN, CF_ACCOUNT_ID, CF_WEB_ANALYTICS_SITE_TAG } = process.env;
	if (!CF_ANALYTICS_TOKEN || !CF_ACCOUNT_ID || !CF_WEB_ANALYTICS_SITE_TAG) return null;

	// The GraphQL API is POST-only, so its answer goes through the Cache API under a made-up URL.
	const cache = await caches.open("home-stats");
	const cacheKey = new Request(`https://${SITE_HOST}/__cache/home-analytics`);
	const cached = await cache.match(cacheKey);
	if (cached) return cached.json();

	try {
		const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${CF_ANALYTICS_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: ANALYTICS_QUERY,
				variables: {
					account: CF_ACCOUNT_ID,
					site: CF_WEB_ANALYTICS_SITE_TAG,
					since: new Date(Date.now() - 30 * 86_400_000).toISOString(),
				},
			}),
			signal: timeout(),
		});
		const account = ((await response.json()) as AnalyticsResponse).data?.viewer.accounts[0];
		if (!account) return null;

		const referrers = new Map<string, number>();
		for (const { count, dimensions } of account.referrers) {
			const host = dimensions.refererHost.replace(/^www\./, "");
			// Clicks between our own pages are not referrals.
			if (host === SITE_HOST) continue;
			const name = host || "Direct";
			referrers.set(name, (referrers.get(name) ?? 0) + count);
		}
		const analytics: Analytics = {
			pageViews: account.total[0]?.count ?? 0,
			referrers: [...referrers]
				.map(([name, views]) => ({ name, views }))
				.sort((a, b) => b.views - a.views),
		};
		await cache.put(
			cacheKey,
			new Response(JSON.stringify(analytics), {
				headers: { "Cache-Control": "max-age=3600" },
			}),
		);
		return analytics;
	} catch {
		return null;
	}
}

export const getHomeStats = createServerFn().handler(async () => {
	const [github, npm, npmTotal, analytics] = await Promise.all([
		getGithub(),
		getNpm(),
		getNpmTotal(),
		getAnalytics(),
	]);

	// Whole weeks, aligned to end on the latest day, starting at the first week with downloads.
	const days = npm.downloads.slice(npm.downloads.length % 7);
	const weeks: Week[] = [];
	for (let i = 0; i < days.length; i += 7) {
		weeks.push({
			start: days[i].day,
			count: days.slice(i, i + 7).reduce((sum, d) => sum + d.downloads, 0),
		});
	}

	return {
		...github,
		npmTotal,
		npmWeeks: weeks.slice(
			Math.max(
				0,
				weeks.findIndex((w) => w.count > 0),
			),
		),
		analytics,
	};
});
