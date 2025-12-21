import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { IoLogoGithub } from "react-icons/io";

import { Button } from "@/components/ui/button";
import { Highlighter } from "@/components/ui/highlighter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({ component: App });

// https://changelog-magicui.vercel.app/

function App() {
	return (
		<div className="relative min-h-dvh w-full flex flex-col h-full z-10">
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
						<Link to="/">
							<Button
								variant="ghost"
								className="gap-2 flex items-center justify-center text-xs cursor-pointer"
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
								<span className="leading-none">{"1.2k".replace(".0k", "k")}</span>
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

			<main className="flex-1 flex items-center justify-center mx-auto border-x max-w-2xl w-full">
				<div className="h-full w-full flex-1 flex py-4 flex-col items-center justify-center gap-4">
					<div className="relative w-full flex flex-col border-y px-4 py-6 md:px-8 md:py-10 gap-4 md:gap-6 dark:bg-[radial-gradient(35%_80%_at_25%_0%,--theme(--color-foreground/.1),transparent)]">
						<div className="w-full max-w-xl mx-auto">
							<p className="text-center text-xl font-bold">
								A modern (pgAdmin alternative but good)
								<Highlighter
									action="highlight"
									color="oklch(0.488 0.243 264.376)"
								>
									database management studio
								</Highlighter>
								for any database
							</p>
						</div>

						<div className="flex flex-col gap-3 md:gap-4 mx-auto max-w-lg w-full">
							<div className="flex flex-col gap-1 text-center md:text-left">
								<h1 className="text-lg font-semibold">Join the waitlist</h1>
								<p className="text-xs text-muted-foreground">
									Be the first to know when DB Studio is released.
								</p>
							</div>

							<form
								action=""
								className="w-full space-y-3 max-w-xl mx-auto"
							>
								<div className="flex flex-col gap-2">
									<Label className="sr-only">Enter your email</Label>
									<Input
										type="email"
										className="h-9 w-full"
										placeholder="Enter your email"
										required
									/>
								</div>
								<Button
									className="w-full text-sm"
									type="submit"
									size="sm"
								>
									Submit
								</Button>
							</form>
						</div>

						<PlusIcon
							className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
							strokeWidth={1}
						/>
						<PlusIcon
							className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
							strokeWidth={1}
						/>
						<PlusIcon
							className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
							strokeWidth={1}
						/>
						<PlusIcon
							className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
							strokeWidth={1}
						/>
					</div>
				</div>
			</main>

			<footer className="border-t">
				<div className="max-w-2xl mx-auto px-4 py-4 md:py-5 flex items-center justify-center relative border-x">
					<p className="text-xs font-light text-muted-foreground flex items-center gap-1">
						© 2025 db-studio. Built by{" "}
						<a
							href="https://github.com/husamql3"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline flex items-start gap-1"
						>
							<img
								src="/avocado.png"
								alt="avocado logo"
								width={16}
								height={16}
							/>
							Hüsam
						</a>
					</p>

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
				</div>
			</footer>
		</div>
	);
}
