import { vi } from "vitest";

// Mock environment variables
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
process.env.NODE_ENV = "test";

// Global test utilities
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(),
	getMysqlPool: vi.fn(),
	getMssqlPool: vi.fn(),
	getDbType: vi.fn(),
	getMongoClient: vi.fn(),
	getMongoDbName: vi.fn(),
	getMongoDb: vi.fn(),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));
