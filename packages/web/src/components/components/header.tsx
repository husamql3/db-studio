import { META } from "@db-studio/shared/constants";
import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { Bug, Moon, Sun } from "lucide-react";
import { LuGithub } from "react-icons/lu";
import { Chat } from "@/components/chat/chat";
import { Tabs } from "@/components/components/tabs";
import { SidebarToggleButton } from "@/components/sidebar/sidebar-toggle-btn";
import { useTheme } from "@/hooks/use-theme";

export const Header = () => {
	const { isDark, toggleTheme } = useTheme();

	return (
		<div className="border-b border-border w-full flex items-center justify-between bg-background text-foreground h-12">
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
							className="border-r-0 border-y-0 border-l border-border rounded-none h-full w-12 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
							onClick={toggleTheme}
							aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
						>
							{isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>{isDark ? "Switch to light mode" : "Switch to dark mode"}</p>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							className="border-r-0 border-y-0 border-l border-border rounded-none h-full w-12 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
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
							className="border-r-0 border-y-0 border-l border-border rounded-none h-full w-12 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
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
