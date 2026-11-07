import { useDatabaseEngine } from "@/hooks/use-database-engine";

export const useIsKeyValue = (): boolean => useDatabaseEngine()?.dataModel === "key-value";
