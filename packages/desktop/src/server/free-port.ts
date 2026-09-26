import { createServer } from "node:net";

export const getFreePort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Could not allocate a port"));
				return;
			}
			server.close(() => resolve(address.port));
		});
	});
