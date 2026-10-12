import { Elysia, t } from 'elysia'

const app = new Elysia()
	.post('/single', ({ body: { file } }) => file, {
		body: t.Object({
			file: t.File({
				maxSize: '1m'
			})
		})
	})
	.post(
		'/multiple',
		({ body: { files } }) => files.reduce((a, b) => a + b.size, 0),
		{
			body: t.Object({
				files: t.Files()
			})
		}
	)
	.listen(3000)
