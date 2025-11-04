import { useActiveTabStore } from "@/store/active-tab.store";
import { IndexesTab } from "../indexes/indexes-tab";
import { RunnerTab } from "../runner/runner-tab";
import { TableTab } from "../table/table-tab";
import { VisualizerTab } from "../visualizer/visualizer-tab";

export const MainContent = () => {
	const { activeTab } = useActiveTabStore();

	switch (activeTab) {
		case "table":
			return <TableTab />;
		case "indexes":
			return <IndexesTab />;
		case "runner":
			return <RunnerTab />;
		case "visualizer":
			return <VisualizerTab />;
	}
};
