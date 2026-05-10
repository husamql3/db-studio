import { SidebarListQueries } from "./sidebar-list-queries";
import { SidebarSearchQueriesList } from "./sidebar-search-queries-list";

export const SidebarContentQueriesList = () => {
	return (
		<>
			<SidebarSearchQueriesList />
			<SidebarListQueries />
		</>
	);
};
