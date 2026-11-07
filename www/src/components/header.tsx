import { HEADER_LINKS, META } from "@db-studio/shared/constants";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FaXTwitter } from "react-icons/fa6";
import { IoLogoGithub } from "react-icons/io";
import { IoMenuOutline } from "react-icons/io5";
import { Button } from "@/components/ui/btn";
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from "@/components/ui/sheet";

// TanStack marks the current route's link with data-status="active".
const NAV_LINK =
	"flex h-8 items-center rounded-sm px-3 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground data-[status=active]:text-foreground";

export const Header = () => {
	const [open, setOpen] = useState(false);

	return (
		<header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between border-x px-3 md:px-5">
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
								size="icon-sm"
								aria-label="Open menu"
							>
								<IoMenuOutline className="size-5" />
							</Button>
						</SheetTrigger>

						<SheetContent
							side="bottom"
							showCloseButton={false}
							onOpenAutoFocus={(e) => e.preventDefault()}
						>
							<SheetHeader className="flex flex-col gap-0.5">
								{HEADER_LINKS.map((link) => (
									<Link
										to={link.href}
										key={link.href}
										activeOptions={{ exact: link.href === "/" }}
										onClick={() => setOpen(false)}
										className={NAV_LINK}
									>
										{link.label}
									</Link>
								))}
							</SheetHeader>
						</SheetContent>
					</Sheet>

					<Link
						to="/"
						className="flex items-center gap-2 rounded-sm px-1 text-sm font-semibold tracking-tight"
					>
						<img
							src="/logo.png"
							alt=""
							width={24}
							height={24}
						/>
						db-studio
					</Link>
				</div>

				<nav className="flex items-center gap-0.5">
					{HEADER_LINKS.map((link) => (
						<Link
							to={link.href}
							key={link.href}
							activeOptions={{ exact: link.href === "/" }}
							className={`${NAV_LINK} hidden md:flex`}
						>
							{link.label}
						</Link>
					))}

					<span
						aria-hidden
						className="mx-2 hidden h-4 w-px bg-border md:block"
					/>

					<Button
						asChild
						variant="ghost"
						size="icon-sm"
					>
						<a
							href={META.SITE_GITHUB_LINK}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="GitHub"
						>
							<IoLogoGithub className="size-4" />
						</a>
					</Button>
					<Button
						asChild
						variant="ghost"
						size="icon-sm"
					>
						<a
							href={META.SITE_X_LINK}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="X"
						>
							<FaXTwitter className="size-3.5" />
						</a>
					</Button>
				</nav>
			</div>
		</header>
	);
};
