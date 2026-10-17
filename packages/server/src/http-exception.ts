/**
 * An error that carries the status the API answers with. Adapters throw it, so the database
 * layer does not depend on the HTTP framework.
 */
export class HTTPException extends Error {
	constructor(
		readonly status: number,
		{ message, cause }: { message?: string; cause?: unknown } = {},
	) {
		super(message, { cause });
	}
}
