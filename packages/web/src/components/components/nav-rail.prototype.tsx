// PROTOTYPE — throw away once a variant wins.
// Question: what should the left icon rail that replaces the header tabs look like?
// Three variants on the real layout route, switchable via `?variant=` (A, B, C, current)
// or the floating bar at the bottom (← / → also cycle).

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
import { Popover, PopoverContent, PopoverTrigger } from "@db-studio/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import { Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import {
	ArrowUpRight,
	Bug,
	Check,
	ChevronLeft,
	ChevronRight,
	CircleArrowUp,
	Columns3Cog,
	Copy,
	Ellipsis,
	FolderKey,
	ListTree,
	type LucideIcon,
	Megaphone,
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
import { type ReactNode, useEffect, useState } from "react";
import { LuGithub } from "react-icons/lu";
import { create } from "zustand";
import { Chat } from "@/components/chat/chat";
import { HeaderActions } from "@/components/components/header";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useTheme } from "@/hooks/use-theme";
import { useOverlayStore } from "@/stores/overlay.store";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { TABS } from "@/utils/constants";

const VARIANTS = [
	{ key: "A", name: "Rail + slim header" },
	{ key: "B", name: "Rail only, no header" },
	{ key: "C", name: "Floating panels" },
	{ key: "current", name: "Current top tabs" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

const STORAGE_KEY = "dbstudio-prototype-nav-rail";
const findVariant = (key: string | null) => VARIANTS.find((v) => v.key === key)?.key;

// localStorage throws when the browser denies storage; this store loads in production too.
const readStoredVariant = () => {
	try {
		return findVariant(localStorage.getItem(STORAGE_KEY));
	} catch {
		return undefined;
	}
};

// URL wins on load; localStorage keeps the choice when in-app links drop the search param.
export const useNavRailVariant = create<{
	variant: VariantKey;
	setVariant: (variant: VariantKey) => void;
	// Fakes for the What's new button; the real app needs a version check.
	updateAvailable: boolean;
	toggleUpdateAvailable: () => void;
	changelogSeen: boolean;
	markChangelogSeen: () => void;
}>()((set) => ({
	updateAvailable: false,
	toggleUpdateAvailable: () =>
		set((s) => ({ updateAvailable: !s.updateAvailable, changelogSeen: false })),
	changelogSeen: false,
	markChangelogSeen: () => set({ changelogSeen: true }),
	variant:
		findVariant(new URLSearchParams(window.location.search).get("variant")) ??
		readStoredVariant() ??
		"A",
	setVariant: (variant) => {
		try {
			localStorage.setItem(STORAGE_KEY, variant);
		} catch {
			// Storage denied: the URL still carries the variant.
		}
		const url = new URL(window.location.href);
		url.searchParams.set("variant", variant);
		window.history.replaceState(window.history.state, "", url);
		set({ variant });
	},
}));

const RAIL_WIDTH = 48;

const ICONS = {
	table: Table2,
	runner: SquareTerminal,
	schema: Columns3Cog,
	indexes: ListTree,
	logs: ScrollText,
	visualizer: Workflow,
	browser: FolderKey,
} satisfies Record<string, LucideIcon>;

// Same flat, square treatment as the header buttons and the old top tabs.
const tile =
	"relative flex size-12 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const activeTile = "bg-muted text-foreground";

const RailTip = ({ label, children }: { label: string; children: ReactNode }) => (
	<Tooltip>
		<TooltipTrigger asChild>{children}</TooltipTrigger>
		<TooltipContent side="right">
			<p className="capitalize">{label}</p>
		</TooltipContent>
	</Tooltip>
);

const RailNav = () => {
	const { pathname } = useLocation();
	const params = useParams({ strict: false });
	const engine = useDatabaseEngine();
	const currentRoute = pathname.split("/")[1] || "table";
	const routes =
		engine?.dataModel === "key-value"
			? (["browser", "runner"] as const)
			: TABS.filter((route) => route !== "indexes" || engine?.indexes);
	const activeTable = (params as { table?: string }).table;

	return routes.map((route) => {
		const Icon = ICONS[route];
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
					aria-label={route}
					aria-current={isActive ? "page" : undefined}
					className={cn(tile, isActive && activeTile)}
				>
					<Icon className="size-5" />
				</Link>
			</RailTip>
		);
	});
};

const RailSidebarToggle = () => {
	const {
		sidebar: { isOpen },
		setSidebarOpen,
		setSidebarPinned,
	} = usePersonalPreferencesStore();
	// Flip both flags from one value so they can never end up out of step. The command
	// palette can unpin an open sidebar, so read visibility from isOpen alone.
	const isVisible = isOpen;

	return (
		<RailTip label={isVisible ? "Hide sidebar" : "Show sidebar"}>
			<button
				type="button"
				aria-label="Toggle sidebar"
				className={tile}
				onClick={() => {
					setSidebarOpen(!isVisible);
					setSidebarPinned(!isVisible);
				}}
			>
				<PanelLeft className="size-5" />
			</button>
		</RailTip>
	);
};

// Stub of the newest entry in www/src/lib/content/changelog.ts.
const LATEST_RELEASE = {
	version: "1.18.0",
	title: "Edit columns from the sidebar and a faster app",
	// Features, then improvements, then fixes, flattened.
	items: [
		"Edit column names and types from the sidebar's Edit table sheet",
		"Faster startup and reloads; heavy panels load on first use",
		"Smoother scrolling and paging in the table grid",
		"Fixed PostgreSQL connections timing out on serverless databases",
	],
};
const UPDATE_COMMAND = "npx db-studio@latest";

const CopyButton = ({ text }: { text: string }) => {
	const [copied, setCopied] = useState(false);

	return (
		<button
			type="button"
			aria-label={copied ? "Copied" : "Copy update command"}
			className="flex size-7 items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground"
			onClick={() => {
				void navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
		>
			{copied ? <Check className="size-3.5 text-foreground" /> : <Copy className="size-3.5" />}
		</button>
	);
};

const WhatsNew = () => {
	const { updateAvailable, changelogSeen, markChangelogSeen } = useNavRailVariant();
	const Icon = updateAvailable ? CircleArrowUp : Megaphone;

	return (
		<Popover onOpenChange={(open) => open && markChangelogSeen()}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={updateAvailable ? "Update available" : "What's new"}
							className={cn(tile, updateAvailable && "text-primary hover:text-primary")}
						>
							<Icon className="size-5" />
							{(updateAvailable || !changelogSeen) && (
								<span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary ring-2 ring-background" />
							)}
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="right">
					<p>{updateAvailable ? `Update to v${LATEST_RELEASE.version}` : "What's new"}</p>
				</TooltipContent>
			</Tooltip>

			<PopoverContent
				side="right"
				align="end"
				sideOffset={8}
				className="w-96 gap-0 rounded-none border border-border p-0 ring-0"
			>
				{updateAvailable && (
					<div className="flex flex-col gap-2 border-b border-border bg-primary/10 p-3">
						<p className="font-medium text-foreground">
							v{LATEST_RELEASE.version} is available
						</p>
						<p className="text-muted-foreground">Restart db-studio with:</p>
						<div className="flex items-center justify-between border border-border bg-background pl-2">
							<code className="font-mono">{UPDATE_COMMAND}</code>
							<CopyButton text={UPDATE_COMMAND} />
						</div>
					</div>
				)}

				<div className="flex flex-col gap-3 p-3">
					<div className="flex items-baseline justify-between gap-2">
						<p className="font-medium text-foreground">What's new</p>
						<p className="text-muted-foreground tabular-nums">v{LATEST_RELEASE.version}</p>
					</div>
					<p className="text-sm font-medium text-foreground text-pretty">
						{LATEST_RELEASE.title}
					</p>
					<ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted-foreground marker:text-muted-foreground/60">
						{LATEST_RELEASE.items.map((item) => (
							<li
								key={item}
								className="text-pretty"
							>
								{item}
							</li>
						))}
					</ul>
				</div>

				<a
					href={META.SITE_CHANGELOG_LINK}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center justify-between border-t border-border px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
				>
					Read the full changelog
					<ArrowUpRight className="size-3.5" />
				</a>
			</PopoverContent>
		</Popover>
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
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="More"
					className={tile}
				>
					<Ellipsis className="size-5" />
				</button>
			</DropdownMenuTrigger>

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

const RailActions = () => {
	const { openOverlay } = useOverlayStore();

	return (
		<>
			{/* Chat ships header-shaped button styles; drop its left border for the rail. */}
			<div className="h-12 w-full [&_button]:border-0!">
				<Chat tooltipSide="right" />
			</div>
			<WhatsNew />
			<RailTip label="Settings">
				<button
					type="button"
					aria-label="Open settings"
					className={tile}
					onClick={() => openOverlay("settings.app")}
				>
					<Settings className="size-5" />
				</button>
			</RailTip>
			<MoreMenu />
		</>
	);
};

const SectionTitle = () => {
	const section = useLocation({ select: (l) => l.pathname.split("/")[1] || "table" });
	return <span className="px-4 text-xs font-medium capitalize">{section}</span>;
};

const SlimHeader = () => (
	<div className="flex h-12 w-full shrink-0 items-center justify-between border-b border-border bg-background">
		<SectionTitle />
		<HeaderActions />
	</div>
);

const Divider = () => <div className="h-px w-full shrink-0 bg-border" />;

// A: rail holds navigation and the sidebar toggle; the header keeps the utility actions.
const VariantA = () => {
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	return (
		<div className="bg-background text-foreground w-dvw flex h-dvh max-h-dvh overflow-hidden relative">
			<nav
				aria-label="Main"
				className="flex shrink-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-2"
				style={{ width: RAIL_WIDTH }}
			>
				<RailSidebarToggle />
				<Divider />
				<RailNav />
			</nav>
			<Sidebar offset={RAIL_WIDTH} />
			<div
				className="relative flex-1 flex flex-col h-full overflow-hidden"
				style={{ marginLeft: isPinned ? `${width}px` : "0" }}
			>
				<SlimHeader />
				<Outlet />
			</div>
		</div>
	);
};

// B: no top header at all. Navigation on top of the rail, utilities pinned to the bottom.
const VariantB = () => {
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	return (
		<div className="bg-background text-foreground w-dvw flex h-dvh max-h-dvh overflow-hidden relative">
			<nav
				aria-label="Main"
				className="flex shrink-0 flex-col border-r border-border bg-background"
				style={{ width: RAIL_WIDTH }}
			>
				<RailSidebarToggle />
				<Divider />
				<RailNav />
				<div className="mt-auto flex flex-col">
					<Divider />
					<RailActions />
				</div>
			</nav>
			<Sidebar offset={RAIL_WIDTH} />
			<div
				className="rail-content relative flex-1 flex flex-col h-full overflow-hidden"
				style={{ marginLeft: isPinned ? `${width}px` : "0" }}
			>
				<Outlet />
			</div>
		</div>
	);
};

// C: borderless rail on a recessed canvas; content sits in a rounded floating panel.
const VariantC = () => {
	const {
		sidebar: { isPinned, width },
	} = usePersonalPreferencesStore();

	return (
		<div className="bg-sidebar text-foreground w-dvw flex h-dvh max-h-dvh overflow-hidden relative">
			<nav
				aria-label="Main"
				className="flex shrink-0 flex-col items-center gap-3 py-3"
				style={{ width: RAIL_WIDTH }}
			>
				<RailNav />
				<div className="mt-auto">
					<RailSidebarToggle />
				</div>
			</nav>
			<Sidebar offset={RAIL_WIDTH} />
			<div
				className="relative flex-1 flex flex-col overflow-hidden my-2 mr-2 rounded-xl border border-border bg-background shadow-sm"
				style={{ marginLeft: isPinned ? `${width + 8}px` : "0" }}
			>
				<SlimHeader />
				<Outlet />
			</div>
		</div>
	);
};

export const NavRailPrototype = ({ variant }: { variant: Exclude<VariantKey, "current"> }) =>
	variant === "A" ? <VariantA /> : variant === "B" ? <VariantB /> : <VariantC />;

export const PrototypeSwitcher = () => {
	const { variant, setVariant, updateAvailable, toggleUpdateAvailable } = useNavRailVariant();
	const index = VARIANTS.findIndex((v) => v.key === variant);
	const cycle = (step: number) =>
		setVariant(VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length].key);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			const target = e.target as HTMLElement;
			if (
				target.closest("input, textarea, [contenteditable], [role=grid], [role=menu], table")
			)
				return;
			cycle(e.key === "ArrowLeft" ? -1 : 1);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	});

	return (
		<div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 p-1 text-xs font-medium text-white shadow-lg ring-2 ring-fuchsia-300">
			<button
				type="button"
				aria-label="Previous variant"
				className="rounded-full p-1.5 hover:bg-white/20"
				onClick={() => cycle(-1)}
			>
				<ChevronLeft className="size-4" />
			</button>
			<span className="min-w-44 text-center tabular-nums">
				{VARIANTS[index].key} ({VARIANTS[index].name})
			</span>
			<button
				type="button"
				aria-label="Next variant"
				className="rounded-full p-1.5 hover:bg-white/20"
				onClick={() => cycle(1)}
			>
				<ChevronRight className="size-4" />
			</button>
			<button
				type="button"
				className="rounded-full px-2.5 py-1.5 hover:bg-white/20"
				onClick={toggleUpdateAvailable}
			>
				Update: {updateAvailable ? "on" : "off"}
			</button>
		</div>
	);
};
