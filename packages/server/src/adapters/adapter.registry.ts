import { DATABASE_ENGINES, type DatabaseTypeSchema } from "@db-studio/shared/types";
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

/** The engines whose data model is key-value; their adapters also browse keys. */
type KeyValueEngine = {
	[T in DatabaseTypeSchema]: (typeof DATABASE_ENGINES)[T]["dataModel"] extends "key-value"
		? T
		: never;
}[DatabaseTypeSchema];

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
} satisfies Record<DatabaseTypeSchema, IDbAdapter> & Record<KeyValueEngine, IKeyValueAdapter>;

export const isDatabaseType = (type: string): type is DatabaseTypeSchema =>
	Object.hasOwn(ADAPTERS, type);

const isKeyValueEngine = (type: DatabaseTypeSchema): type is KeyValueEngine =>
	DATABASE_ENGINES[type].dataModel === "key-value";

export function keyValueAdapter(dbType: DatabaseTypeSchema): IKeyValueAdapter {
	if (!isKeyValueEngine(dbType)) {
		throw new HTTPException(400, {
			message: `Key browsing is not supported for database type: "${dbType}"`,
		});
	}

	return ADAPTERS[dbType];
}
