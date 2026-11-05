import type { DatabaseEngine } from "@db-studio/shared/types";
import {
	Columns3Cog,
	FolderKey,
	ListTree,
	type LucideIcon,
	ScrollText,
	SquareTerminal,
	Table2,
	Workflow,
} from "lucide-react";

type Section = {
	id: string;
	icon: LucideIcon;
	/** `data` is the key list on key-value engines and the table list elsewhere. */
	sidebar: "data" | "queries" | null;
	/** Opens on the selected table, so switching between these views keeps it. */
	perTable: boolean;
	appliesTo: (engine: DatabaseEngine) => boolean;
};

const isKeyValue = (engine: DatabaseEngine) => engine.dataModel === "key-value";

/** Every app section, in nav rail order. The first one an engine has is its home. */
export const SECTIONS = [
	{
		id: "browser",
		icon: FolderKey,
		sidebar: "data",
		perTable: false,
		appliesTo: isKeyValue,
	},
	{
		id: "table",
		icon: Table2,
		sidebar: "data",
		perTable: true,
		appliesTo: (engine) => !isKeyValue(engine),
	},
	{
		id: "runner",
		icon: SquareTerminal,
		sidebar: "queries",
		perTable: false,
		appliesTo: () => true,
	},
	{
		id: "schema",
		icon: Columns3Cog,
		sidebar: "data",
		perTable: true,
		appliesTo: (engine) => !isKeyValue(engine),
	},
	{
		id: "indexes",
		icon: ListTree,
		sidebar: "data",
		perTable: true,
		appliesTo: (engine) => Boolean(engine.indexes),
	},
	{
		id: "logs",
		icon: ScrollText,
		sidebar: "data",
		perTable: false,
		appliesTo: (engine) => engine.serverLogs,
	},
	{
		id: "visualizer",
		icon: Workflow,
		sidebar: null,
		perTable: false,
		appliesTo: (engine) => !isKeyValue(engine),
	},
] as const satisfies readonly Section[];

export type SectionId = (typeof SECTIONS)[number]["id"];

/** The section a pathname is in; `/` belongs to the table section. */
export const sectionOf = (pathname: string): (typeof SECTIONS)[number] | undefined => {
	const segment = pathname.split("/")[1] || "table";

	return SECTIONS.find((section) => section.id === segment);
};

export const homePath = (engine: DatabaseEngine | undefined) =>
	`/${(engine && SECTIONS.find((section) => section.appliesTo(engine))?.id) || "table"}` as const;
