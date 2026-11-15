import { spawn } from "node:child_process";

const port = process.env.PORT || "8787";
const isRemote = process.argv.includes("--remote");
const args = ["wrangler", "dev", "--port", port, ...(isRemote ? ["--remote"] : [])];

const child = spawn("bunx", args, {
	stdio: "inherit",
	shell: true,
});

child.on("exit", (code) => {
	process.exit(code ?? 0);
});
