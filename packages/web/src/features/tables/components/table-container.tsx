import type { Table } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useLayoutEffect, useRef } from "react";
import type { TableRecord } from "@/types/table.type";
import { useGridClipboard } from "../hooks/use-grid-clipboard";
import { PastePreviewDialog } from "./paste-preview-dialog";
import { TableBody } from "./table-body";
import { TableHead } from "./table-head";

export const TableContainer = ({
	table,
	pageKey,
}: {
	table: Table<TableRecord>;
	pageKey: string;
}) => {
	const visibleColumns = table.getVisibleLeafColumns();

	// The virtualizers need to know the scrollable container element
	const tableContainerRef = useRef<HTMLDivElement | null>(null);
	const { onCopy, onPaste, preview, stagePreview, closePreview } = useGridClipboard(table);

	// Another page, sort or filter starts at the top, even when it was cached and the grid stayed
	// mounted; Live mode refreshing the same page keeps the position.
	useLayoutEffect(() => {
		tableContainerRef.current?.scrollTo({ top: 0 });
	}, [pageKey]);

	// we are using a slightly different virtualization strategy for columns (compared to virtual rows) in order to support dynamic row heights
	const columnVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableCellElement>({
		count: visibleColumns.length,
		estimateSize: (index) => visibleColumns[index].getSize(), //estimate width of each column for accurate scrollbar dragging
		getScrollElement: () => tableContainerRef.current,
		horizontal: true,
		overscan: 3, // how many columns to render on each side off screen each way (adjust this for performance)
	});

	const virtualColumns = columnVirtualizer.getVirtualItems();

	//different virtualization strategy for columns - instead of absolute and translateY, we add empty columns to the left and right
	let virtualPaddingLeft: number | undefined;
	let virtualPaddingRight: number | undefined;

	if (columnVirtualizer && virtualColumns?.length) {
		virtualPaddingLeft = virtualColumns[0]?.start ?? 0;
		virtualPaddingRight =
			columnVirtualizer.getTotalSize() - (virtualColumns[virtualColumns.length - 1]?.end ?? 0);
	}

	return (
		<div
			className="w-full flex-1 overflow-auto bg-background text-foreground"
			ref={tableContainerRef}
			style={{
				position: "relative",
			}}
			onCopy={onCopy}
			onPaste={onPaste}
		>
			{/* Even though we're still using sematic table tags, we must use CSS grid and flexbox for dynamic row heights */}
			<table
				style={{ display: "grid" }}
				className="text-foreground"
			>
				<TableHead
					columnVirtualizer={columnVirtualizer}
					table={table}
					virtualPaddingLeft={virtualPaddingLeft}
					virtualPaddingRight={virtualPaddingRight}
				/>
				<TableBody
					columnVirtualizer={columnVirtualizer}
					table={table}
					tableContainerRef={tableContainerRef as RefObject<HTMLDivElement>}
					virtualPaddingLeft={virtualPaddingLeft as number | undefined}
					virtualPaddingRight={virtualPaddingRight}
				/>
			</table>
			<PastePreviewDialog
				preview={preview}
				onStage={stagePreview}
				onClose={closePreview}
			/>
		</div>
	);
};
