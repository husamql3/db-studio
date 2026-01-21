export type ApiResponse<T> = {
	data: T;
};

export type ApiError = {
	error: string;
};

export type ApiResult<T> = ApiResponse<T> | ApiError;
