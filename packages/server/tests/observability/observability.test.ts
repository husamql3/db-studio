import { describe, expect, it } from "vitest";
import {
	durationBucket,
	operationForRequest,
	outcomeForStatus,
} from "@/observability.js";

describe("observability privacy boundary", () => {
	it("classifies routes without retaining user-controlled path values", () => {
		expect(operationForRequest("GET", "/api/pg/tables/customer-secrets")).toBe("get_tables");
		expect(operationForRequest("POST", "/api/query/private-query-id")).toBe("post_query");
		expect(operationForRequest("GET", "/api/unknown/private-value")).toBe("get_other");
	});

	it("buckets outcomes and latency without retaining exact measurements", () => {
		expect(outcomeForStatus(200)).toBe("success");
		expect(outcomeForStatus(404)).toBe("client_error");
		expect(outcomeForStatus(503)).toBe("server_error");
		expect(durationBucket(99)).toBe("under_100ms");
		expect(durationBucket(1_500)).toBe("1s_5s");
	});
});
