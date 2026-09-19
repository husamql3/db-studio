/**
 * Cloudflare Workers exposes a default cache on the global `caches` object.
 * `lib.dom` does not declare it, so augment it here as optional — it is
 * genuinely absent when the same modules run in the browser.
 */
interface CacheStorage {
	readonly default?: Cache;
}
