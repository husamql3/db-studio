import type { RelatedRecord } from "@/hooks/use-delete-cells";

export const RelatedRecordsView = ({
	relatedRecords,
}: {
	relatedRecords: RelatedRecord[];
}) => {
	return (
		<div className="space-y-4 max-h-80 overflow-y-auto">
			{relatedRecords.map((related, idx) => (
				<div
					key={`${related.tableName}-${related.columnName}-${idx}`}
					className="border border-zinc-700 rounded-md p-3"
				>
					<div className="font-medium text-sm mb-2">
						Table: <span className="text-primary">{related.tableName}</span>
						<span className="text-muted-foreground ml-2">
							({related.records.length} record{related.records.length !== 1 ? "s" : ""})
						</span>
					</div>
					<div className="text-xs text-muted-foreground mb-2">
						References column: {related.columnName}
					</div>
					<div className="bg-zinc-900 rounded p-2 text-xs overflow-x-auto">
						<pre className="whitespace-pre-wrap">
							{JSON.stringify(related.records.slice(0, 5), null, 2)}
							{related.records.length > 5 && (
								<div className="text-muted-foreground mt-2">
									... and {related.records.length - 5} more
								</div>
							)}
						</pre>
					</div>
				</div>
			))}
		</div>
	);
};
