import { TableTab } from "@/components/table-tab/table-tab";
import { useActiveTabStore } from "@/stores/active-tab.store";

export const MainContent = () => {
	const { activeTab } = useActiveTabStore();

	switch (activeTab) {
		case "table":
			return <TableTab />;
		case "indexes":
			return <NotYet />;
		case "runner":
			return <NotYet />;
		case "logs":
			return <NotYet />;
		case "visualizer":
			return <NotYet />;
		case "schema":
			return <NotYet />;
		case "assistant":
			return <NotYet />;
	}
};

export const NotYet = () => {
	return (
		<main className="flex-1 flex items-center justify-center">
			<h1>Coming soon!</h1>
		</main>
	);
};
