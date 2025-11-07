import { TableTab } from "@/components/table-grid/table-tab";
import { useActiveTabStore } from "@/stores/active-tab.store";

export const MainContent = () => {
	const { activeTab } = useActiveTabStore();

	switch (activeTab) {
		case "table":
			return <TableTab />;
		case "indexes":
			return <h1>Indexes</h1>;
		case "runner":
			return <h1>Runner</h1>;
		case "visualizer":
			return <h1>Visualizer</h1>;
		case "schema":
			return <h1>Schema</h1>;
	}
};
