/**
 * How long a driver waits to open one connection. A serverless database waking from idle (Neon,
 * Supabase, PlanetScale, Aurora Serverless, Azure SQL) or a distant region with TLS can take
 * several seconds to accept one; at 2 s those users saw every request fail with a connect timeout.
 */
export const CONNECT_TIMEOUT_MS = 10_000;
