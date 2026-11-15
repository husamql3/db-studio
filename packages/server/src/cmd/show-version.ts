import { intro, outro } from "@clack/prompts";
import color from "picocolors";
import packageJson from "../../package.json" with { type: "json" };

export const showVersion = () => {
	intro(color.inverse(" db-studio "));
	outro(color.green(`🚀 db-studio v${packageJson.version}`));
};
