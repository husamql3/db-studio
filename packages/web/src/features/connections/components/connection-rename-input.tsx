import type { ConnectionSummarySchemaType } from "@db-studio/shared/types";
import { useRef, useState } from "react";
import { useManageConnection } from "../hooks/use-manage-connection";

/** Inline rename: Enter or leaving the field saves, Escape cancels. */
export const ConnectionRenameInput = ({
	connection,
	onDone,
}: {
	connection: ConnectionSummarySchemaType;
	onDone: () => void;
}) => {
	const { rename } = useManageConnection(connection);
	const [value, setValue] = useState(connection.name);
	// Escape unmounts the field, and the blur that follows must not save it anyway.
	const finished = useRef(false);

	const finish = (save: boolean) => {
		if (finished.current) return;
		finished.current = true;
		const name = value.trim();
		if (save && name && name !== connection.name) rename(name);
		onDone();
	};

	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: the field appears because the user chose Rename
			autoFocus
			aria-label="Connection name"
			value={value}
			maxLength={100}
			onChange={(e) => setValue(e.target.value)}
			onBlur={() => finish(true)}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === "Enter") finish(true);
				if (e.key === "Escape") finish(false);
			}}
			className="h-6 min-w-0 flex-1 rounded-sm border border-input bg-background px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
		/>
	);
};
