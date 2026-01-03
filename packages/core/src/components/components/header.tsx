import { IconBrandGithub } from "@tabler/icons-react";
import { Tabs } from "@/components/components/tabs";
import { SidebarToggleButton } from "@/components/sidebar/sidebar-toggle-btn";
import { Button } from "@/components/ui/button";
import { LINKS } from "@/utils/constants";

export const Header = () => {
	return (
		<div className="border-b border-zinc-800 w-full flex items-center justify-between bg-black h-12">
			<div className="flex items-center h-full">
				<SidebarToggleButton />
				<Tabs />
			</div>

			<div className="flex items-center h-full">
				{/* <Button
					variant="ghost"
					className="border-r-0 border-y-0 border-l border-zinc-800 rounded-none h-full w-12"
				>
					<IconSparkles className="size-5" />
				</Button> */}

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
			</div>
		</div>
	);
};
