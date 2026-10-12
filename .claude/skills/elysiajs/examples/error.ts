import { Elysia, t } from 'elysia'

class CustomError extends Error {
	constructor(public name: string) {
		super(name)
	}
}

new Elysia()
	.error({
		CUSTOM_ERROR: CustomError
	})
	// global handler
	.onError(({ code, error, status }) => {
		switch (code) {
			case "CUSTOM_ERROR":
				return status(401, { message: error.message })

			case "NOT_FOUND":
				return "Not found :("
		}
	})
	.post('/', ({ body }) => body, {
		body: t.Object({
			username: t.String(),
			password: t.String(),
			nested: t.Optional(
				t.Object({
					hi: t.String()
				})
			)
		}),
		// local handler
		error({ error }) {
			console.log(error)
		}
	})
	.listen(3000)
