import { META } from "@db-studio/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@db-studio/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import {
	Bug,
	Check,
	Columns3Cog,
	Ellipsis,
	FolderKey,
	ListTree,
	type LucideIcon,
	Monitor,
	Moon,
	PanelLeft,
	ScrollText,
	Settings,
	SquareTerminal,
	Sun,
	Table2,
	Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { LuGithub } from "react-icons/lu";
import { Chat } from "@/components/chat/chat";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useTheme } from "@/hooks/use-theme";
import { useOverlayStore } from "@/stores/overlay.store";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { CONSTANTS, TABS } from "@/utils/constants";

const ICONS = {
	table: Table2,
	runner: SquareTerminal,
	schema: Columns3Cog,
	indexes: ListTree,
	logs: ScrollText,
	visualizer: Workflow,
	browser: FolderKey,
} satisfies Record<string, LucideIcon>;

const railTile =
	"relative flex size-12 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const RailTip = ({ label, children }: { label: string; children: ReactNode }) => (
	<Tooltip>
		<TooltipTrigger asChild>{children}</TooltipTrigger>
		<TooltipContent side="right">
			<p className="capitalize">{label}</p>
		</TooltipContent>
	</Tooltip>
);

const RailSections = () => {
	const { pathname } = useLocation();
	const params = useParams({ strict: false });
	const engine = useDatabaseEngine();
	const currentRoute = pathname.split("/")[1] || "table";
	const routes =
		engine?.dataModel === "key-value"
			? (["browser", "runner", "logs"] as const)
			: TABS.filter(
					(route) =>
						(route !== "indexes" || engine?.indexes) &&
						(route !== "logs" || engine?.serverLogs),
				);
	const activeTable = (params as { table?: string }).table;
	const openSchema = useTableSchemaName();

	return routes.map((route) => {
		const Icon = ICONS[route];
		// Keep the selected table when switching between the per-table views (data, schema,
		// indexes), so leaving schema mode doesn't drop the selection.
		const keepTable =
			(route === "table" || route === "schema" || route === "indexes") && activeTable;
		const isActive = currentRoute === route;

		return (
			<RailTip
				key={route}
				label={route}
			>
				<Link
					to={keepTable ? `/${route}/$table` : `/${route}`}
					params={keepTable ? { table: activeTable as string } : undefined}
					search={keepTable ? { [CONSTANTS.TABLE_SCHEMA]: openSchema } : undefined}
					aria-label={route}
					aria-current={isActive ? "page" : undefined}
					className={cn(railTile, isActive && "bg-muted text-foreground")}
				>
					<Icon className="size-5" />
				</Link>
			</RailTip>
		);
	});
};

const SidebarToggle = () => {
	const {
		sidebar: { isOpen },
		setSidebarOpen,
		setSidebarPinned,
	} = usePersonalPreferencesStore();

	return (
		<RailTip label={isOpen ? "Hide sidebar" : "Show sidebar"}>
			<button
				type="button"
				aria-label="Toggle sidebar"
				className={railTile}
				onClick={() => {
					// Flip both flags from one value: the command palette can unpin an open
					// sidebar, so they may have drifted apart.
					setSidebarOpen(!isOpen);
					setSidebarPinned(!isOpen);
				}}
			>
				<PanelLeft className="size-5" />
			</button>
		</RailTip>
	);
};

const THEMES = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
] as const;

// Theme, bug report and GitHub are rarely used: one menu instead of three buttons.
const MoreMenu = () => {
	const { theme, setTheme } = useTheme();
	const ThemeIcon = THEMES.find((t) => t.value === theme)?.icon ?? Monitor;

	return (
		<DropdownMenu>
			<RailTip label="More">
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="More"
						className={railTile}
					>
						<Ellipsis className="size-5" />
					</button>
				</DropdownMenuTrigger>
			</RailTip>

			<DropdownMenuContent
				side="right"
				align="end"
				sideOffset={8}
				className="w-48"
			>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<ThemeIcon />
						Theme
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						{THEMES.map(({ value, label, icon: Icon }) => (
							<DropdownMenuItem
								key={value}
								onClick={() => setTheme(value)}
							>
								<Icon />
								{label}
								{theme === value && <Check className="ml-auto" />}
							</DropdownMenuItem>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<a
						href={META.SITE_GITHUB_NEW_ISSUE_LINK}
						target="_blank"
						rel="noopener noreferrer"
					>
						<Bug />
						Report a bug
					</a>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<a
						href={META.SITE_GITHUB_LINK}
						target="_blank"
						rel="noopener noreferrer"
					>
						<LuGithub />
						View on GitHub
					</a>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

const Divider = () => <div className="h-px w-full shrink-0 bg-border" />;

// Navigation on top, utilities pinned to the bottom; there is no top header.
export const NavRail = () => {
	const { openOverlay } = useOverlayStore();
	const { pathname } = useLocation();
	const hasSidebar = pathname.split("/")[1] !== "visualizer";

	return (
		<nav
			aria-label="Main"
			className="flex shrink-0 flex-col border-r border-border bg-background"
			style={{ width: CONSTANTS.RAIL_WIDTH }}
		>
			{hasSidebar && (
				<>
					<SidebarToggle />
					<Divider />
				</>
			)}
			<RailSections />
			<div className="mt-auto flex flex-col">
				<Divider />
				<Chat />
				<RailTip label="Settings">
					<button
						type="button"
						aria-label="Open settings"
						className={railTile}
						onClick={() => openOverlay("settings.app")}
					>
						<Settings className="size-5" />
					</button>
				</RailTip>
				<MoreMenu />
			</div>
		</nav>
	);
};
