import { Elysia, t } from 'elysia'

new Elysia()
	.get('/', 'Hello Elysia')
	.post('/', ({ body: { name } }) => name, {
		body: t.Object({
			name: t.String()
		})
	})
