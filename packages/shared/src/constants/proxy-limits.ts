export const ONE_DAY = 24 * 60 * 60 * 1000;
export const LIMIT = 3;
/**
 * Ceiling for requests that carry a personal API key (BYOK). Those requests do
 * not spend our hosted Gemini quota, so they get a far higher allowance — but
 * not an unlimited one, otherwise an arbitrary `x-byok-*` header would be enough
 * to bypass the limiter entirely.
 */
export const BYOK_LIMIT = 120;
