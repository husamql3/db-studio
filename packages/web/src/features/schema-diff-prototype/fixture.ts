// PROTOTYPE — throwaway. Hand-written schema diff for the /migrations UI prototype.
// No diff engine runs: both snapshots and the change list are fixed so every variant shows
// the same scenario. Direction: make `to` (prod) match `from` (dev).

export type ProtoColumn = {
	name: string;
	type: string;
	nullable: boolean;
	default?: string;
	pk?: boolean;
};

export type ProtoTable = {
	name: string;
	columns: ProtoColumn[];
	indexes: string[];
	fks: string[];
};

export type Risk = "safe" | "review" | "destructive";

export type ProtoChange = {
	id: string;
	table: string;
	kind:
		| "create-table"
		| "drop-table"
		| "add-column"
		| "drop-column"
		| "alter-column"
		| "rename-column"
		| "add-index"
		| "add-fk"
		| "other";
	target?: string;
	/** Table a foreign key points at; the graph draws a link from its lane. */
	references?: string;
	summary: string;
	before?: string;
	after?: string;
	sql: string;
	risk: Risk;
	phase: 1 | 2 | 3 | 4;
};

export const PHASES = {
	1: "Create tables",
	2: "Change columns",
	3: "Indexes and foreign keys",
	4: "Drop tables",
} as const;

export const FROM_DB = "app_dev";
export const TO_DB = "app_prod";

const id = (name = "id"): ProtoColumn => ({
	name,
	type: "integer",
	nullable: false,
	default: "nextval(…)",
	pk: true,
});

export const FROM_SNAPSHOT: ProtoTable[] = [
	{
		name: "coupons",
		columns: [
			id(),
			{ name: "code", type: "varchar(32)", nullable: false },
			{ name: "percent_off", type: "integer", nullable: false },
			{ name: "expires_at", type: "timestamptz", nullable: true },
		],
		indexes: ["coupons_code_key UNIQUE (code)"],
		fks: [],
	},
	{
		name: "orders",
		columns: [
			id(),
			{ name: "user_id", type: "integer", nullable: false },
			{ name: "coupon_id", type: "integer", nullable: true },
			{ name: "total", type: "numeric(12,2)", nullable: false, default: "0" },
			{ name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
		],
		indexes: ["orders_user_id_idx (user_id)"],
		fks: ["user_id → users.id", "coupon_id → coupons.id"],
	},
	{
		name: "products",
		columns: [
			id(),
			{ name: "name", type: "text", nullable: false },
			{ name: "price", type: "numeric(10,2)", nullable: false },
		],
		indexes: [],
		fks: [],
	},
	{
		name: "users",
		columns: [
			id(),
			{ name: "email", type: "varchar(255)", nullable: false },
			{ name: "full_name", type: "text", nullable: true },
			{ name: "last_login_at", type: "timestamptz", nullable: true },
			{ name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
		],
		indexes: ["users_email_key UNIQUE (email)"],
		fks: [],
	},
];

export const TO_SNAPSHOT: ProtoTable[] = [
	{
		name: "audit_log",
		columns: [
			id(),
			{ name: "event", type: "text", nullable: false },
			{ name: "payload", type: "jsonb", nullable: true },
		],
		indexes: [],
		fks: [],
	},
	{
		name: "orders",
		columns: [
			id(),
			{ name: "user_id", type: "integer", nullable: false },
			{ name: "total", type: "numeric(10,2)", nullable: false, default: "0" },
			{ name: "legacy_status", type: "text", nullable: true },
			{ name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
		],
		indexes: ["orders_user_id_idx (user_id)"],
		fks: ["user_id → users.id"],
	},
	{
		name: "products",
		columns: [
			id(),
			{ name: "name", type: "text", nullable: false },
			{ name: "price", type: "numeric(10,2)", nullable: false },
		],
		indexes: [],
		fks: [],
	},
	{
		name: "users",
		columns: [
			id(),
			{ name: "email", type: "varchar(120)", nullable: false },
			{ name: "fullname", type: "text", nullable: true },
			{ name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
		],
		indexes: [],
		fks: [],
	},
];

/** `users.fullname` (prod) and `users.full_name` (dev) look like one renamed column. */
export const RENAME_CANDIDATE = { table: "users", from: "fullname", to: "full_name" };

export const buildChanges = (acceptRename: boolean): ProtoChange[] => [
	{
		id: "c1",
		table: "coupons",
		kind: "create-table",
		summary: "Create table coupons",
		after: "4 columns, 1 unique index",
		sql: `CREATE TABLE "coupons" (\n  "id" serial PRIMARY KEY,\n  "code" varchar(32) NOT NULL,\n  "percent_off" integer NOT NULL,\n  "expires_at" timestamptz\n);`,
		risk: "safe",
		phase: 1,
	},
	...(acceptRename
		? [
				{
					id: "c2",
					table: "users",
					kind: "rename-column",
					target: "fullname",
					summary: "Rename fullname → full_name",
					before: "fullname",
					after: "full_name",
					sql: `ALTER TABLE "users" RENAME COLUMN "fullname" TO "full_name";`,
					risk: "review",
					phase: 2,
				} satisfies ProtoChange,
			]
		: [
				{
					id: "c2a",
					table: "users",
					kind: "drop-column",
					target: "fullname",
					summary: "Drop column fullname",
					before: "text NULL",
					sql: `ALTER TABLE "users" DROP COLUMN "fullname";`,
					risk: "destructive",
					phase: 2,
				} satisfies ProtoChange,
				{
					id: "c2b",
					table: "users",
					kind: "add-column",
					target: "full_name",
					summary: "Add column full_name",
					after: "text NULL",
					sql: `ALTER TABLE "users" ADD COLUMN "full_name" text;`,
					risk: "safe",
					phase: 2,
				} satisfies ProtoChange,
			]),
	{
		id: "c3",
		table: "users",
		kind: "alter-column",
		target: "email",
		summary: "Widen email",
		before: "varchar(120)",
		after: "varchar(255)",
		sql: `ALTER TABLE "users" ALTER COLUMN "email" TYPE varchar(255);`,
		risk: "safe",
		phase: 2,
	},
	{
		id: "c4",
		table: "users",
		kind: "add-column",
		target: "last_login_at",
		summary: "Add column last_login_at",
		after: "timestamptz NULL",
		sql: `ALTER TABLE "users" ADD COLUMN "last_login_at" timestamptz;`,
		risk: "safe",
		phase: 2,
	},
	{
		id: "c5",
		table: "orders",
		kind: "add-column",
		target: "coupon_id",
		summary: "Add column coupon_id",
		after: "integer NULL",
		sql: `ALTER TABLE "orders" ADD COLUMN "coupon_id" integer;`,
		risk: "safe",
		phase: 2,
	},
	{
		id: "c6",
		table: "orders",
		kind: "alter-column",
		target: "total",
		summary: "Change total precision",
		before: "numeric(10,2)",
		after: "numeric(12,2)",
		sql: `ALTER TABLE "orders" ALTER COLUMN "total" TYPE numeric(12,2);`,
		risk: "review",
		phase: 2,
	},
	{
		id: "c7",
		table: "orders",
		kind: "drop-column",
		target: "legacy_status",
		summary: "Drop column legacy_status",
		before: "text NULL · 18,204 non-null values",
		sql: `ALTER TABLE "orders" DROP COLUMN "legacy_status";`,
		risk: "destructive",
		phase: 2,
	},
	{
		id: "c8",
		table: "users",
		kind: "add-index",
		target: "users_email_key",
		summary: "Add unique index on email",
		after: "UNIQUE (email)",
		sql: `CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");`,
		risk: "review",
		phase: 3,
	},
	{
		id: "c9",
		table: "orders",
		kind: "add-fk",
		target: "coupon_id",
		references: "coupons",
		summary: "Add foreign key coupon_id → coupons.id",
		after: "coupon_id → coupons.id",
		sql: `ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey"\n  FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id");`,
		risk: "safe",
		phase: 3,
	},
	{
		id: "c10",
		table: "audit_log",
		kind: "drop-table",
		summary: "Drop table audit_log",
		before: "3 columns · 412,880 rows",
		sql: `DROP TABLE "audit_log";`,
		risk: "destructive",
		phase: 4,
	},
];

export const UNCHANGED_TABLES = ["products"];

export const toScript = (changes: ProtoChange[]) =>
	["BEGIN;", ...changes.map((c) => c.sql), "COMMIT;"].join("\n\n");

export const RISK_STYLE: Record<Risk, string> = {
	safe: "text-muted-foreground",
	review: "text-amber-600 dark:text-amber-400",
	destructive: "text-red-600 dark:text-red-400",
};

// --- Migration list (sidebar) ---

export type MigrationStatus = "new" | "draft" | "applied" | "failed";

export type ProtoMigration = {
	id: string;
	name: string;
	from: string;
	to: string;
	status: MigrationStatus;
	date: string;
	/** Applied/failed runs are frozen; drafts rebuild their changes from the rename answer. */
	changes: (acceptRename: boolean) => ProtoChange[];
	askRename: boolean;
	durationMs?: number;
	failure?: { step: number; error: string };
};

const pick = (ids: string[]) => () => buildChanges(true).filter((c) => ids.includes(c.id));

export const MIGRATIONS: ProtoMigration[] = [
	{
		id: "new",
		name: "Untitled comparison",
		from: FROM_DB,
		to: TO_DB,
		status: "new",
		date: "Not saved",
		changes: buildChanges,
		askRename: true,
	},
	{
		id: "m5",
		name: "Coupons and user profile",
		from: FROM_DB,
		to: TO_DB,
		status: "draft",
		date: "Today, 10:42",
		changes: buildChanges,
		askRename: true,
	},
	{
		id: "m4",
		name: "Coupons on staging",
		from: FROM_DB,
		to: "app_staging",
		status: "applied",
		date: "Oct 20, 16:05",
		changes: pick(["c1", "c5", "c9"]),
		askRename: false,
		durationMs: 184,
	},
	{
		id: "m3",
		name: "Drop audit_log",
		from: FROM_DB,
		to: TO_DB,
		status: "failed",
		date: "Oct 16, 09:12",
		changes: pick(["c10"]),
		askRename: false,
		durationMs: 41,
		failure: {
			step: 1,
			error:
				'cannot drop table audit_log because other objects depend on it (view "audit_daily" depends on table audit_log)',
		},
	},
	{
		id: "m2",
		name: "Widen users.email",
		from: FROM_DB,
		to: TO_DB,
		status: "applied",
		date: "Oct 14, 11:30",
		changes: pick(["c3"]),
		askRename: false,
		durationMs: 2210,
	},
	{
		id: "m1",
		name: "last_login_at on staging",
		from: FROM_DB,
		to: "app_staging",
		status: "applied",
		date: "Oct 2, 14:58",
		changes: pick(["c4"]),
		askRename: false,
		durationMs: 12,
	},
];

export const STATUS_STYLE: Record<MigrationStatus, string> = {
	new: "text-muted-foreground",
	draft: "text-muted-foreground",
	applied: "text-muted-foreground",
	failed: "text-red-600 dark:text-red-400",
};

/** Stable 7-char "commit hash" for a statement, so the graph reads like git. */
export const shortHash = (text: string) => {
	let h = 5381;
	for (const ch of text) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
	return h.toString(16).padStart(8, "0").slice(0, 7);
};

/** Lane colors, picked to stay legible on both themes. */
export const LANE_COLORS = ["#38bdf8", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#fb7185"];
