import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { useQueriesStore } from "@/stores/queries.store";
import { CONSTANTS } from "@/utils/constants";

export const SidebarSearchQueriesList = () => {
	const { addQuery } = useQueriesStore();
	const navigate = useNavigate();
	const inputRef = useRef<HTMLInputElement>(null);
	const [searchTerm, setSearchTerm] = useQueryState(CONSTANTS.SIDEBAR_SEARCH, {
		defaultValue: "",
	});

	const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchTerm(e.target.value);
	};

	const handleAddQuery = () => {
		const queryId = addQuery();
		navigate({ to: "/runner/$queryId", params: { queryId } });
	};

	return (
		<div className="p-3 space-y-2 border-b border-zinc-800">
			<Button
				className="w-full justify-start h-8"
				onClick={handleAddQuery}
			>
				<IconPlus className="size-4" />
				Add Query
			</Button>

			<div className="relative">
				<IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					placeholder="Search queries"
					value={searchTerm ?? ""}
					onChange={handleSearch}
					className="rounded-sm h-8 pl-8 pr-8"
				/>
				<Kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">/</Kbd>
			</div>
		</div>
	);
};
