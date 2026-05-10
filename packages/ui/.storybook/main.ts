import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
	stories: ["../src/**/*.stories.@(ts|tsx)"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	viteFinal: (config) => ({
		...config,
		plugins: [...(config.plugins ?? []), tailwindcss()],
	}),
};

export default config;
