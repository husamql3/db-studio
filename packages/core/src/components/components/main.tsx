import { useQueryState } from "nuqs";
import { TableTab } from "@/components/table-tab/table-tab";
import { CONSTANTS } from "@/utils/constants";
import { AddRecordForm } from "../add-table/add-record/add-record-form";

export const Main = () => {
	const [activeTab] = useQueryState(CONSTANTS.ACTIVE_TAB);

	switch (activeTab) {
		case "table":
			return (
				<main className="flex-1 flex flex-col overflow-hidden">
					<TableTab />
					<AddRecordForm />
				</main>
			);
		case "runner":
			return <NotYet tab={activeTab} />;
		case "indexes":
			return <NotYet tab={activeTab} />;
		case "logs":
			return <NotYet tab={activeTab} />;
		case "visualizer":
			return <NotYet tab={activeTab} />;
		case "schema":
			return <NotYet tab={activeTab} />;
		case "assistant":
			return <NotYet tab={activeTab} />;
		default:
			return (
				<main className="flex-1 flex items-center justify-center">
					<h1>Select a table to view</h1>
				</main>
			);
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
