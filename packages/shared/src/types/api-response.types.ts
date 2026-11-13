export type BaseResponse<T> = {
	data: T;
	message?: string;
};

export type ApiError = {
	error: string;
	details?: string;
	/** Correlates this failure with the server log line and error report. */
	requestId?: string;
};
