import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { FaXTwitter } from "react-icons/fa6";
import { IoLogoGithub } from "react-icons/io";
import { IoMenuOutline } from "react-icons/io5";
import { Button } from "@/components/ui/btn";
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from "@/components/ui/sheet";

const LINKS = [
	{ label: "Home", href: "/" },
	{ label: "Roadmap", href: "/roadmap" },
	{ label: "Docs", href: "/docs/$" },
	{ label: "Changelog", href: "/changelog" },
];

export const Header = ({ stars }: { stars: string | null }) => {
	const [open, setOpen] = useState(false);

	return (
		<header className="border-b">
			<div className="max-w-2xl mx-auto px-4 py-4 md:py-5 flex items-center justify-between relative border-x">
				<div className="flex items-center gap-1">
					<Sheet
						open={open}
						onOpenChange={setOpen}
					>
						<SheetTrigger
							asChild
							className="md:hidden"
						>
							<Button
								variant="ghost"
								size="icon"
								className="flex items-center justify-center text-xs cursor-pointer hover:bg-primary-foreground/10"
							>
								<IoMenuOutline className="size-5" />
							</Button>
						</SheetTrigger>

						<SheetContent
							side="bottom"
							showCloseButton={false}
							onOpenAutoFocus={(e) => e.preventDefault()}
						>
							<SheetHeader className="flex flex-col">
								{LINKS.map((link) => (
									<Link
										to={link.href}
										key={link.href}
										onClick={() => setOpen(false)}
										className="w-full"
									>
										<Button
											variant="ghost"
											className="w-full justify-start text-xs hover:bg-primary-foreground/10"
										>
											{link.label}
										</Button>
									</Link>
								))}
							</SheetHeader>
						</SheetContent>
					</Sheet>

					<Link to="/">
						<img
							src="/logo.png"
							alt="DB Studio"
							width={32}
							className="md:w-8 w-6"
						/>
					</Link>
				</div>

				{/* Desktop nav */}
				<div className="items-center gap-1 flex">
					{LINKS.map((link) => (
						<Link
							to={link.href}
							key={link.href}
							className="hidden md:block"
						>
							<Button
								variant="ghost"
								className="gap-2 flex items-center justify-center text-xs cursor-pointer hover:bg-primary-foreground/10"
							>
								{link.label}
							</Button>
						</Link>
					))}

					<a
						href="https://github.com/husamql3/db-studio"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Button
							variant="ghost"
							className="gap-2 items-center"
						>
							<IoLogoGithub className="size-4" />
							{stars && (
								<span className="leading-none text-xs">{stars.replace(".0k", "k")}</span>
							)}
						</Button>
					</a>

					<a
						href="https://x.com/dbstudio_sh"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Button
							variant="ghost"
							className="gap-2 items-center"
						>
							<FaXTwitter className="size-3.5" />
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
