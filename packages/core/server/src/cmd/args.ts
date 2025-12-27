import { program } from "commander";

type Args = {
	env?: string;
	port?: string;
	databaseUrl?: string;
	status?: boolean;
	help?: boolean;
	version?: boolean;
};

export const args = () => {
	program
		.name("db-studio")
		.option("-e, --env <path>", "Path to custom .env file")
		.option("-p, --port <port>", "Port to run the server on")
		.option("-d, --database-url <url>", "Database URL to use")
		.option("-s, --status", "Show status of the server")
		.option("-h, --help", "Show help")
		.option("-v, --version", "Show version");

	// parse the arguments and return the options
	program.parse(process.argv);

	const opts = program.opts<Args>();
	console.log("opts", opts);

	return {
		env: opts.env,
		port: opts.port,
		databaseUrl: opts.databaseUrl,
		status: opts.status,
		help: opts.help,
		version: opts.version,
	};
};
