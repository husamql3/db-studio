import { useQueryState } from "nuqs";
import { CONSTANTS } from "@/utils/constants";

export const Main = () => {
	const [activeTab] = useQueryState(CONSTANTS.ACTIVE_TAB, {
		shallow: true,
	});

	console.log(activeTab);

	switch (activeTab) {
		case "table":
			return <h1>Table</h1>;
		case "indexes":
			return <NotYet tab={activeTab} />;
		case "runner":
			return <NotYet tab={activeTab} />;
		case "logs":
			return <NotYet tab={activeTab} />;
		case "visualizer":
			return <NotYet tab={activeTab} />;
		case "schema":
			return <NotYet tab={activeTab} />;
		case "assistant":
			return <NotYet tab={activeTab} />;
	}
};

const NotYet = ({ tab }: { tab: string }) => {
	console.log(tab);
	return (
		<main className="flex-1 flex items-center justify-center">
			<h1>{tab} will be available soon!</h1>
		</main>
	);
};
