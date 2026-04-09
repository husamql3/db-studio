import { createServerFn } from "@tanstack/react-start";

export type Contributor = {
	login: string;
	avatarUrl: string;
	contributions: number;
	profileUrl: string;
};

export const getContributors = createServerFn().handler(async (): Promise<Contributor[]> => {
	try {
		const response = await fetch(
			"https://api.github.com/repos/husamql3/db-studio/contributors",
			{
				headers: {
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "db-studio-website",
				},
			},
		);

		const json = (await response.json()) as Array<{
			login: string;
			avatar_url: string;
			contributions: number;
			html_url: string;
		}>;

		if (!Array.isArray(json) || json.length === 0) return [];

		const leastContributorIndex = json.reduce(
			(leastIndex, contributor, index) =>
				contributor.contributions < json[leastIndex].contributions ? index : leastIndex,
			0,
		);

		return json
			.filter((_, index) => index !== leastContributorIndex)
			.map((c) => ({
				login: c.login,
				avatarUrl: c.avatar_url,
				contributions: c.contributions,
				profileUrl: c.html_url,
			}));
	} catch (error) {
		console.error(error);
		return [];
	}
});
