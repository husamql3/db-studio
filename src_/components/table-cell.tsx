import { useEffect, useState } from "react";

type TableCellProps = {
	value: unknown;
	rowId: string;
	columnKey: string;
	isChanged: boolean;
	onChange: (rowId: string, columnKey: string, newValue: string) => void;
};

export const TableCell = ({ value, rowId, columnKey, isChanged, onChange }: TableCellProps) => {
	const [localValue, setLocalValue] = useState(String(value ?? ""));

	// Sync with external value changes (like when table refreshes or changes are saved)
	useEffect(() => {
		setLocalValue(String(value ?? ""));
	}, [value]);

	const handleChange = (newValue: string) => {
		setLocalValue(newValue);
		onChange(rowId, columnKey, newValue);
	};

	return (
		<input
			type="text"
			className={`w-full bg-transparent px-3 py-2.5 focus:outline-none focus:bg-zinc-900/50 transition-colors ${isChanged ? "bg-blue-900/30 border-l-2 border-blue-500" : ""}`}
			value={localValue}
			onChange={(e) => handleChange(e.target.value)}
		/>
	);
};
