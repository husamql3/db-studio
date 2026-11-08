import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";

import { cn } from "../utils";

const Tabs = TabsPrimitive.Root;

const TabsList = ({
	className,
	ref,
	...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.List>) => (
	<TabsPrimitive.List
		ref={ref}
		className={cn(
			"inline-flex h-7 items-center justify-center rounded-sm border text-muted-foreground",
			className,
		)}
		{...props}
	/>
);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = ({
	className,
	ref,
	...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) => (
	<TabsPrimitive.Trigger
		ref={ref}
		className={cn(
			"inline-flex h-full items-center justify-center whitespace-nowrap border-l px-2 text-xs font-medium transition-colors first:rounded-l-sm first:border-l-0 last:rounded-r-sm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground",
			className,
		)}
		{...props}
	/>
);
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = ({
	className,
	ref,
	...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Content>) => (
	<TabsPrimitive.Content
		ref={ref}
		className={cn("mt-2 focus-visible:outline-none", className)}
		{...props}
	/>
);
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
