# GraphQL Yoga

This plugin integrates GraphQL yoga with Elysia

## Installation
```bash
bun add @elysiajs/graphql-yoga
```

## Basic Usage
```typescript
import { Elysia } from 'elysia'
import { yoga } from '@elysiajs/graphql-yoga'

const app = new Elysia()
	.use(
		yoga({
			typeDefs: /* GraphQL */ `
				type Query {
					hi: String
				}
			`,
			resolvers: {
				Query: {
					hi: () => 'Hello from Elysia'
				}
			}
		})
	)
	.listen(3000)
```

Accessing `/graphql` in the browser (GET request) would show you a GraphiQL instance for the GraphQL-enabled Elysia server.

optional: you can install a custom version of optional peer dependencies as well:

```bash
bun add graphql graphql-yoga
```

## Resolver

Elysia uses Mobius to infer type from **typeDefs** field automatically, allowing you to get full type-safety and auto-complete when typing **resolver** types.

## Context

You can add custom context to the resolver function by adding **context**

```ts
import { Elysia } from 'elysia'
import { yoga } from '@elysiajs/graphql-yoga'

const app = new Elysia()
	.use(
		yoga({
			typeDefs: /* GraphQL */ `
				type Query {
					hi: String
				}
			`,
			context: {
				name: 'Mobius'
			},
			// If context is a function on this doesn't present
			// for some reason it won't infer context type
			useContext(_) {},
			resolvers: {
				Query: {
					hi: async (parent, args, context) => context.name
				}
			}
		})
	)
	.listen(3000)
```

## Config

This plugin extends [GraphQL Yoga's createYoga options, please refer to the GraphQL Yoga documentation](https://the-guild.dev/graphql/yoga-server/docs) with inlining `schema` config to root.

Below is a config which is accepted by the plugin

### path

@default `/graphql`

Endpoint to expose GraphQL handler
