import { Elysia, file } from 'elysia'

/**
 * Example of handle single static file
 *
 * @see https://github.com/elysiajs/elysia-static
 */
new Elysia()
	.get('/tako', file('./example/takodachi.png'))
	.listen(3000)
