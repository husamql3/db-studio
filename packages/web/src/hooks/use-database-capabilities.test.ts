import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDatabaseStore } from "@/stores/database.store";
import { useDatabaseCapability } from "./use-database-capabilities";

describe("useDatabaseCapability", () => {
	beforeEach(() => {
		useDatabaseStore.setState({ dbType: null });
	});

	it("returns true for liveMode when dbType is pg", () => {
		useDatabaseStore.setState({ dbType: "pg" });
		const { result } = renderHook(() => useDatabaseCapability("liveMode"));
		expect(result.current).toBe(true);
	});

	it("returns false for liveMode when dbType is mysql", () => {
		useDatabaseStore.setState({ dbType: "mysql" });
		const { result } = renderHook(() => useDatabaseCapability("liveMode"));
		expect(result.current).toBe(false);
	});

	it("returns false for liveMode when dbType is mssql", () => {
		useDatabaseStore.setState({ dbType: "mssql" });
		const { result } = renderHook(() => useDatabaseCapability("liveMode"));
		expect(result.current).toBe(false);
	});

	it("returns false for liveMode when dbType is sqlite", () => {
		useDatabaseStore.setState({ dbType: "sqlite" });
		const { result } = renderHook(() => useDatabaseCapability("liveMode"));
		expect(result.current).toBe(false);
	});

	it("returns false for liveMode when dbType is mongodb", () => {
		useDatabaseStore.setState({ dbType: "mongodb" });
		const { result } = renderHook(() => useDatabaseCapability("liveMode"));
		expect(result.current).toBe(false);
	});

	it("returns false for liveMode when dbType is redis", () => {
		useDatabaseStore.setState({ dbType: "redis" });
		const { result } = renderHook(() => useDatabaseCapability("liveMode"));
		expect(result.current).toBe(false);
	});

	it("returns false for liveMode when dbType is null", () => {
		useDatabaseStore.setState({ dbType: null });
		const { result } = renderHook(() => useDatabaseCapability("liveMode"));
		expect(result.current).toBe(false);
	});
});
