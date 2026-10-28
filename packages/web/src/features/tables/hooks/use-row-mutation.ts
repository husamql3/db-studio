import { useDatabaseEngine } from "@/hooks/use-database-engine";

/** Whether the connected engine allows grid edits and deletes, and why not when it doesn't. */
export const useRowMutation = () => {
	const engine = useDatabaseEngine();
	return {
		canMutateRows: engine?.rowMutation ?? true,
		rowMutationReason: engine?.rowMutation === false ? engine.rowMutationReason : undefined,
	};
};
