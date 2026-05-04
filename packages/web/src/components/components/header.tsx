import { META } from "@db-studio/shared/constants";
import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { Bug } from "lucide-react";
import { LuGithub } from "react-icons/lu";
import { Chat } from "@/components/chat/chat";
import { Tabs } from "@/components/components/tabs";
import { SidebarToggleButton } from "@/components/sidebar/sidebar-toggle-btn";

export const Header = () => {
	return (
		<div className="border-b border-zinc-800 w-full flex items-center justify-between bg-black h-12">
			<div className="flex items-center h-full">
				<SidebarToggleButton />
				<Tabs />
			</div>

			<div className="flex items-center h-full">
				<Chat />

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
								<LuGithub className="size-5" />
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
