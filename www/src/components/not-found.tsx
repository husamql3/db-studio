import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";

export const NotFound = () => {
	return (
		<div className="flex items-center justify-center max-w-2xl w-full mx-auto flex-1 border-x">
			<Empty className="mx-auto">
				<EmptyHeader>
					<EmptyTitle className="font-black font-mono text-7xl">404</EmptyTitle>
					<EmptyDescription className="text-nowrap">
						The page you're looking for might have been <br />
						moved or doesn't exist.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<div className="flex gap-2">
						<Button
							asChild
							size="lg"
						>
							<Link to="/">
								<Home /> Go Home
							</Link>
						</Button>
					</div>
				</EmptyContent>
			</Empty>
		</div>
	);
};
