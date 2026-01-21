import { vi } from "vitest";

// Mock environment variables
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
process.env.NODE_ENV = "test";

// Global test utilities
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(),
}));
