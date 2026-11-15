import { connectUrlSchema, updateConnectionSchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { connect, connectSaved, getConnectionsState, updateConnection } from "@/connection.js";
import { deleteSavedConnection } from "@/connections-store.js";

// Saved URLs never leave the server; the browser refers to them by id and sees masked URLs.
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
