import { TableTab } from "@/components/table-tab/table-tab";
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
		case "assistant":
			return <h1>Assistant</h1>;
	}
};
