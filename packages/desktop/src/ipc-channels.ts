export const IPC = {
	getVersion: "desktop:get-version",
	getApiBaseUrl: "desktop:get-api-base-url",
	getServerStatus: "desktop:get-server-status",
	serverStatusChanged: "desktop:server-status-changed",
	listConnections: "desktop:connections:list",
	saveConnection: "desktop:connections:save",
	deleteConnection: "desktop:connections:delete",
	connect: "desktop:connect",
	disconnect: "desktop:disconnect",
	importEnvFile: "desktop:import-env-file",
	openExternal: "desktop:open-external",
} as const;
