import { connectUrlSchema, updateConnectionSchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { connect, connectSaved, getConnectionsState, summarize } from "@/connection.js";
import { deleteSavedConnection, updateSavedConnection } from "@/connections-store.js";

/**
 * /connections routes: the saved connections and the open one. Saved URLs never leave the
 * server; the browser refers to them by id and sees masked URLs.
 * GET    /connections              - saved connections and the active one
 * POST   /connections              - test a pasted URL, switch to it and save it
 * POST   /connections/:id/connect  - test a saved connection and switch to it
 * PATCH  /connections/:id          - rename or recolor a saved connection
 * DELETE /connections/:id          - forget a saved connection (an open one stays open)
 */
export const connectionsRoutes = new Elysia({ prefix: "/connections" })
	.get("/", async () => ({ data: await getConnectionsState() }))

	.post(
		"/",
		async ({ body }) => {
			await connect(body.url, { requireExistingFile: true });
			return { data: await getConnectionsState() };
		},
		{ body: connectUrlSchema },
	)

	.post("/:id/connect", async ({ params }) => {
		await connectSaved(params.id);
		return { data: await getConnectionsState() };
	})

	.patch(
		"/:id",
		async ({ params, body }) => ({
			data: summarize(await updateSavedConnection(params.id, body)),
		}),
		{ body: updateConnectionSchema },
	)

	.delete("/:id", async ({ params }) => {
		await deleteSavedConnection(params.id);
		return { data: "Connection removed" };
	});
