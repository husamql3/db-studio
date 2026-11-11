/**
 * The request IDs the server and the proxy accept from a caller: a plain token, safe to log. Both
 * must agree, or one request stops reading the same in both logs.
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
