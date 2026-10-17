import { Elysia } from 'elysia'

new Elysia()
	.get('/', () => 'Hi')
	.get('/redirect', ({ redirect }) => redirect('/'))
	.listen(3000)
