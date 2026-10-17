import { Elysia } from 'elysia'

new Elysia()
	.state('counter', 0)
	.get('/', ({ store }) => store.counter++)
	.listen(3000)
