export type TableRow = Record<string, unknown>;

export interface TablePage {
	data: TableRow[];
	nextCursor: number | undefined;
	prevCursor: number | undefined;
	totalRows: number;
}

export const getTable = async (table: string | null): Promise<TableRow[]> => {
	await new Promise((resolve) => setTimeout(resolve, 1000));
	console.log("getTable", table);

	let result: TableRow[] = [];

	switch (table) {
		case "users":
			result = await import("../data/users.json").then((module) => module.default);
			break;
		case "posts":
			result = await import("../data/posts.json").then((module) => module.default);
			break;
		case "comments":
			result = await import("../data/comments.json").then((module) => module.default);
			break;
		case "categories":
			result = await import("../data/categories.json").then((module) => module.default);
			break;
		case "tags":
			result = await import("../data/tags.json").then((module) => module.default);
			break;
		case "media":
			result = await import("../data/media.json").then((module) => module.default);
			break;
		case "pages":
			result = await import("../data/pages.json").then((module) => module.default);
			break;
		case "orders":
			result = await import("../data/orders.json").then((module) => module.default);
			break;
		case "products":
			result = await import("../data/products.json").then((module) => module.default);
			break;
		case "invoices":
			result = await import("../data/invoices.json").then((module) => module.default);
			break;
		case "profiles":
			result = await import("../data/profiles.json").then((module) => module.default);
			break;
		case "messages":
			result = await import("../data/messages.json").then((module) => module.default);
			break;
		case "notifications":
			result = await import("../data/notifications.json").then((module) => module.default);
			break;
		case "settings":
			result = await import("../data/settings.json").then((module) => module.default);
			break;
		case "audit_logs":
			result = await import("../data/audit_logs.json").then((module) => module.default);
			break;
		case "sessions":
			result = await import("../data/sessions.json").then((module) => module.default);
			break;
		case "attachments":
			result = await import("../data/attachments.json").then((module) => module.default);
			break;
		case "teams":
			result = await import("../data/teams.json").then((module) => module.default);
			break;
		case "projects":
			result = await import("../data/projects.json").then((module) => module.default);
			break;
		case "subscriptions":
			result = await import("../data/subscriptions.json").then((module) => module.default);
			break;
		default:
			result = [];
	}

	console.log(
		"getTable returning",
		table,
		"with",
		result.length,
		"rows",
		result[0] ? Object.keys(result[0]) : "no keys",
	);
	return result;
};

export const getTablePage = async (
	table: string | null,
	pageParam: number = 1,
	pageSize: number = 100,
): Promise<TablePage> => {
	// Simulate network delay
	await new Promise((resolve) => setTimeout(resolve, 500));

	console.log("getTablePage", table, "page:", pageParam, "pageSize:", pageSize);

	// Get all data
	const allData = await getTable(table);

	// Calculate pagination
	const startIndex = (pageParam - 1) * pageSize;
	const endIndex = startIndex + pageSize;
	const data = allData.slice(startIndex, endIndex);

	// Determine if there are more pages
	const hasMore = endIndex < allData.length;
	const nextCursor = hasMore ? pageParam + 1 : undefined;
	const prevCursor = pageParam > 1 ? pageParam - 1 : undefined;

	console.log(`Returning page ${pageParam}: ${data.length} rows (${startIndex}-${endIndex} of ${allData.length})`);

	return {
		data,
		nextCursor,
		prevCursor,
		totalRows: allData.length,
	};
};
