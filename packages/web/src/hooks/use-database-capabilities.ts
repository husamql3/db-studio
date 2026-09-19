import { type DatabaseCapability, hasDatabaseCapability } from "@db-studio/shared/types";
import { useDatabaseStore } from "@/stores/database.store";

export const useDatabaseCapability = (capability: DatabaseCapability): boolean => {
	const dbType = useDatabaseStore((state) => state.dbType);
	return hasDatabaseCapability(dbType, capability);
};
