export const TableErrorState = ({
	tableName,
	errorTableData,
	errorTableCols,
}: {
	tableName: string;
	errorTableData: Error | null;
	errorTableCols: Error | null;
}) => {
	const error = errorTableData || errorTableCols;
	const errorMessage = error?.message || "";
	const isTableNotFound =
		errorMessage.includes("does not exist") ||
		errorMessage.includes("404") ||
		(error as Error & { status?: number })?.status === 404;
	const isNetworkError =
		errorMessage.includes("Network Error") || errorMessage.includes("Failed to fetch");

	let errorTitle = "Something went wrong";
	let errorDescription = errorMessage || "An unexpected error occurred";

	if (isTableNotFound) {
		errorTitle = "Table not found";
		errorDescription =
			errorMessage || `The table "${tableName}" does not exist or has been deleted`;
	} else if (isNetworkError) {
		errorTitle = "Connection failed";
		errorDescription =
			"Unable to connect to the database server. Please check your connection.";
	}

	return (
		<div className="size-full flex flex-col items-center justify-center">
			<div className="flex-1 flex flex-col items-center justify-center gap-2">
				<div className="text-sm font-medium">{errorTitle}</div>
				<div className="text-sm text-muted-foreground">{errorDescription}</div>
			</div>
		</div>
	);
};
