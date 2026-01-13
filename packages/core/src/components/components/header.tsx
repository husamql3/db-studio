import { IconBrandGithub } from "@tabler/icons-react";
import { Tabs } from "@/components/components/tabs";
import { SidebarToggleButton } from "@/components/sidebar/sidebar-toggle-btn";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LINKS } from "@/utils/constants";
import { Chat } from "../chat/chat";

export const Header = () => {
	// const { openSheet } = useSheetStore();

	return (
		<div className="border-b border-zinc-800 w-full flex items-center justify-between bg-black h-12">
			<div className="flex items-center h-full">
				<SidebarToggleButton />
				<Tabs />
			</div>

			<div className="flex items-center h-full">
				<Chat />
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
								href={LINKS.GITHUB}
								target="_blank"
								rel="noopener noreferrer"
							>
								<IconBrandGithub className="size-5" />
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
