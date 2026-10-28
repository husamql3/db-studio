/**
 * Standard API success response wrapper type
 * Used by both server and client
 */
export type BaseResponse<T> = {
	data: T;
	message?: string;
};

/**
 * Standard API error response type
 */
export type ApiError = {
	error: string;
	details?: string;
	/** Correlates this failure with the server log line and error report. */
	requestId?: string;
};
