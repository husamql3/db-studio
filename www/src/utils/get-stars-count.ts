import { createServerFn } from "@tanstack/react-start";

export const getStarsCount = createServerFn().handler(async () => {
	try {
		const response = await fetch(
			"https://api.github.com/repos/husamql3/db-studio",
			{
				headers: {
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "db-studio-website",
				},
			},
		);
		const json = (await response.json()) as { stargazers_count: number };

		const formattedCount =
			json.stargazers_count >= 1000
				? json.stargazers_count % 1000 === 0
					? `${Math.floor(json.stargazers_count / 1000)}k`
					: `${(json.stargazers_count / 1000).toFixed(1)}k`
				: json.stargazers_count?.toString()?.toLocaleString();

		return formattedCount;
	} catch (error) {
		console.error(error);
		return null;
	}
});
