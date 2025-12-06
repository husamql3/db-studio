import { IoLogoGithub } from "react-icons/io";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export const Header = ({ stars }: { stars: string }) => {
	return (
		<header className="border-b border-zinc-800 shrink-0 sticky top-0 left-0 right-0 z-10 bg-zinc-950">
			<div className="max-w-2xl mx-auto px-4 py-4 border-x border-zinc-800 flex items-center justify-between">
				<Link to="/">
					<img
						src="/logo.png"
						alt="DB Studio"
						width={32}
					/>
				</Link>

				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
					>
						<Link
							to="/roadmap"
							className="text-xs gap-2 flex items-center justify-center leading-none"
						>
							Roadmap
						</Link>
					</Button>

					<Button
						variant="ghost"
						size="sm"
					>
						<a
							href="https://github.com/husamql3/db-studio"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs gap-2 flex items-center justify-center"
						>
							<IoLogoGithub className="size-4" />
							<span className="leading-none">{stars.replace(".0k", "k")}</span>
						</a>
					</Button>
				</div>
			</div>
		</header>
	);
};
