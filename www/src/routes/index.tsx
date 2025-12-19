import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { IoLogoGithub } from "react-icons/io";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({ component: App });

function App() {
	return (
		<div className="relative min-h-screen w-full flex flex-col h-full z-10">
			<header className="border-b">
				<div className="max-w-2xl mx-auto px-4 pt-5 pb-5 flex items-center justify-between relative border-x">
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
								variant="outline"
								className="gap-2 flex items-center justify-center leading-none"
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
								variant="outline"
								className="gap-2 flex items-center justify-center"
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

			<main className="max-w-2xl mx-auto w-full py-4 flex-1 flex flex-col items-center justify-center gap-4 border-x">
				<div className="relative w-full flex p-6 border-y gap-7">
					<div className="flex flex-col justify-center gap-2 flex-1">
						<h1 className="text-2xl font-bold ">Join the waitlist</h1>
						<p className="text-sm text-muted-foreground">
							Be the first to know when DB Studio is released.
						</p>
					</div>

					<form
						action=""
						className="w-full space-y-4 flex-1"
					>
						<div className="flex flex-col gap-2">
							<Label>Email</Label>
							<Input
								type="email"
								className="h-8"
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

					<PlusIcon
						className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
						strokeWidth={1}
					/>
					<PlusIcon
						className="-top-[12.5px] -right-[12.5px] absolute h-6 w-6"
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
			</main>

			<footer className="border-t">
				<div className="max-w-2xl mx-auto px-4 pt-5 pb-5 flex items-center justify-center relative border-x">
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
