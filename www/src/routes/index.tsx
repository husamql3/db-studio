import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { Silk } from "@/components/silk";
import { Button } from "@/components/ui/button";
import { Highlighter } from "@/components/ui/highlighter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({ component: App });

// https://changelog-magicui.vercel.app/
// https://magicui.design/docs/templates/changelog

function App() {
	return (
		<main className="flex-1 flex items-center justify-center mx-auto border-x max-w-2xl w-full">
			<div className="h-full relative w-full flex-1 flex py-4 flex-col items-center justify-center gap-4">
				<div className="relative w-full flex flex-col border-y px-4 py-6 md:px-8 md:py-10 gap-6 md:gap-10">
					<Silk
						speed={4}
						scale={1}
						color="#222222"
						noiseIntensity={0.4}
						rotation={0}
					/>

					<div className="w-full max-w-xl mx-auto">
						<p className="text-center md:text-xl font-bold">
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
							<h1 className="font-semibold">Join the waitlist</h1>
							<p className="text-xs text-muted-foreground">
								We're almost ready to launch! Sign up for early access and we'll notify
								you.
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
									className="md:h-11 h-9 w-full bg-zinc-950! md:text-sm text-xs"
									placeholder="Enter your email"
									required
								/>
							</div>

							<Button
								className="w-full md:text-sm md:h-11 h-9 text-xs bg-[#1447e6] text-white hover:bg-[#1447e6]/80"
								type="submit"
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
	);
}
