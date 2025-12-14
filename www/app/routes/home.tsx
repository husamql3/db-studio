import { Header } from "@/components/header";
import { Input } from "@/components/ui/input";

export function meta() {
	return [
		{ title: "DB Studio" },
		{
			name: "description",
			content: "DB Studio is a modern database management system for your data.",
		},
	];
}

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

// https://efferd.com/view/cta-12

export default function Home({ loaderData }: { loaderData: { stars: string } }) {
	return (
		<div className="min-h-screen w-full flex flex-col h-full">
			<Header stars={loaderData.stars} />

			<main className="max-w-2xl mx-auto w-full py-4 border-x border-zinc-800 flex-1 flex flex-col items-center justify-center gap-4">
				<div className="flex flex-col items-center justify-center gap-2">
					<h2 className="text-2xl font-bold">Join the waitlist</h2>
					<p className="text-sm text-zinc-400">
						Be the first to know when DB Studio is released.
					</p>

					<Input
						type="email"
						placeholder="Email"
						className="w-full max-w-sm"
					/>
				</div>
			</main>
		</div>
	);
}
