import { Header } from "@/components/header";

export async function loader() {
	const data = await fetch("https://api.github.com/repos/husamql3/db-studio");
	const json = await data.json();

	const formattedCount =
		json.stargazers_count >= 1000
			? json.stargazers_count % 1000 === 0
				? `${Math.floor(json.stargazers_count / 1000)}k`
				: `${(json.stargazers_count / 1000).toFixed(1)}k`
			: json.stargazers_count.toLocaleString();

	return { stars: formattedCount };
}

export default function Roadmap({ loaderData }: { loaderData: { stars: string } }) {
	return (
		<div className="min-h-screen w-full flex flex-col h-full">
			<Header stars={loaderData.stars} />

			<main className="max-w-2xl mx-auto w-full py-4 border-x border-zinc-800 flex-1 flex flex-col items-center justify-center gap-4">
				x
			</main>
		</div>
	);
}
