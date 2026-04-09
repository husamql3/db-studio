import { Bug, Github } from "lucide-react";
import { META } from "shared/constants";
// import { Chat } from "@/components/chat/chat";
import { Tabs } from "@/components/components/tabs";
import { SidebarToggleButton } from "@/components/sidebar/sidebar-toggle-btn";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const Header = () => {
	// const { openSheet } = useSheetStore();

	return (
		<div className="border-b border-zinc-800 w-full flex items-center justify-between bg-black h-12">
			<div className="flex items-center h-full">
				<SidebarToggleButton />
				<Tabs />
			</div>

			<div className="flex items-center h-full">
				{/* <Chat /> */}
				{/* <Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							className="border-r-0 border-y-0 border-l border-zinc-800 rounded-none h-full w-12"
							onClick={() => openSheet("ai-assistant")}
						>
							<IconSparkles className="size-5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>AI Assistant</p>
					</TooltipContent>
				</Tooltip> */}

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							className="border-r-0 border-y-0 border-l border-zinc-800 rounded-none h-full w-12"
							asChild
						>
							<a
								href={META.SITE_GITHUB_NEW_ISSUE_LINK}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Create a new GitHub issue"
							>
								<Bug className="size-5" />
							</a>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Report a bug</p>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							className="border-r-0 border-y-0 border-l border-zinc-800 rounded-none h-full w-12"
							asChild
						>
							<a
								href={META.SITE_GITHUB_LINK}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="View the db-studio GitHub repository"
							>
								<Github className="size-5" />
							</a>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>View on GitHub</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
};
