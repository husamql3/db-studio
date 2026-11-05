import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import { ClickhouseAdapter } from "@/adapters/clickhouse/clickhouse.adapter.js";
import { DuckDbAdapter } from "@/adapters/duckdb/duckdb.adapter.js";
import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";
import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";
import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";
import { OracleAdapter } from "@/adapters/oracle/oracle.adapter.js";
import { PgAdapter } from "@/adapters/pg/pg.adapter.js";
import { RedisAdapter } from "@/adapters/redis/redis.adapter.js";
import { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";
import { HTTPException } from "@/http-exception.js";
import type { IDbAdapter } from "./adapter.interface.js";
import type { IKeyValueAdapter } from "./key-value-adapter.interface.js";

export const ADAPTERS = {
	pg: new PgAdapter(),
	mysql: new MySqlAdapter(),
	mssql: new MsSqlAdapter(),
	mongodb: new MongoAdapter(),
	sqlite: new SqliteAdapter(),
	redis: new RedisAdapter(),
	duckdb: new DuckDbAdapter(),
	oracle: new OracleAdapter(),
	clickhouse: new ClickhouseAdapter(),
} satisfies Record<DatabaseTypeSchema, IDbAdapter>;

export const isDatabaseType = (type: string): type is DatabaseTypeSchema =>
	Object.hasOwn(ADAPTERS, type);

const isKeyValueAdapter = (adapter: IDbAdapter): adapter is IDbAdapter & IKeyValueAdapter =>
	"scanKeys" in adapter && typeof adapter.scanKeys === "function";

export function assertKeyValueAdapter(
	adapter: IDbAdapter,
	dbType: DatabaseTypeSchema,
): IKeyValueAdapter {
	if (!isKeyValueAdapter(adapter)) {
		throw new HTTPException(400, {
			message: `Key browsing is not supported for database type: "${dbType}"`,
		});
	}

	return adapter;
}
