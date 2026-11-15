const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const isLoopbackAddress = (host: string) => LOOPBACK_HOSTS.has(host);

/** A loopback address or any `*.localhost` name, which resolves to loopback. */
export const isLoopbackHostname = (hostname: string) =>
	isLoopbackAddress(hostname) || hostname.endsWith(".localhost");
