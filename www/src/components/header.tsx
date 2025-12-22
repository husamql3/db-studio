import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { IoLogoGithub } from "react-icons/io";
import { Button } from "@/components/ui/button";

export const Header = ({ stars }: { stars: string | null }) => {
	return (
		<header className="border-b">
			<div className="max-w-2xl mx-auto px-4 py-4 md:py-5 flex items-center justify-between relative border-x">
				<Link to="/">
					<img
						src="/logo.png"
						alt="DB Studio"
						width={32}
					/>
				</Link>

				<div className="flex items-center gap-1">
					<Link to="/roadmap">
						<Button
							variant="ghost"
							className="gap-2 flex items-center justify-center text-xs cursor-pointer hover:bg-primary-foreground!"
						>
							Roadmap
						</Button>
					</Link>

					<a
						href="https://github.com/husamql3/db-studio"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Button
							variant="ghost"
							className="gap-2 flex items-center justify-center text-xs cursor-pointer"
						>
							<IoLogoGithub className="size-4" />
							{stars && <span className="leading-none">{stars.replace(".0k", "k")}</span>}
						</Button>
					</a>
				</div>

				<PlusIcon
					className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
					strokeWidth={1}
				/>
				<PlusIcon
					className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
					strokeWidth={1}
				/>
			</div>
		</header>
	);
};
