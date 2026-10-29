import { connectUrlSchema, updateConnectionSchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { connect, connectSaved, getConnectionsState, updateConnection } from "@/connection.js";
import { deleteSavedConnection } from "@/connections-store.js";

/**
 * /connections routes: the saved connections and the one this browser tab has open. Saved URLs
 * never leave the server; the browser refers to them by id and sees masked URLs.
 * GET    /connections              - saved connections and this tab's open one
 * POST   /connections              - test a pasted URL, open it and save it
 * POST   /connections/:id/connect  - test a saved connection and open it
 * PATCH  /connections/:id          - rename, recolor or switch read-only on a saved connection
 * DELETE /connections/:id          - forget a saved connection (an open one stays open)
 */
export const connectionsRoutes = new Elysia({ prefix: "/connections" })
	.get("/", async () => ({ data: await getConnectionsState() }))

	.post(
		"/",
		async ({ body }) => {
			const id = await connect(body.url, { requireExistingFile: true });
			return { data: await getConnectionsState(id) };
		},
		{ body: connectUrlSchema },
	)

	.post("/:id/connect", async ({ params }) => ({
		data: await getConnectionsState(await connectSaved(params.id)),
	}))

	.patch(
		"/:id",
		async ({ params, body }) => ({ data: await updateConnection(params.id, body) }),
		{ body: updateConnectionSchema },
	)

	.delete("/:id", async ({ params }) => {
		await deleteSavedConnection(params.id);
		return { data: "Connection removed" };
	});
