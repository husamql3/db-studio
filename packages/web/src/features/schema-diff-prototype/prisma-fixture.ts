// PROTOTYPE — throwaway. A fake `prisma/migrations` folder joined with a fake `_prisma_migrations`
// table, so the page can show every state a real project hits. Nothing reads disk or the DB:
// a real version would list `prisma/migrations/*/migration.sql` on the server and select
// `migration_name, checksum, started_at, finished_at, rolled_back_at, logs, applied_steps_count`
// from `_prisma_migrations`.
import type { ProtoChange, Risk } from "./fixture";

export type PrismaStatus = "applied" | "pending" | "failed" | "missing";

export type PrismaMigration = {
	/** Folder name: `<14-digit timestamp>_<name>`. */
	folder: string;
	/** `migration.sql`; absent when the row exists but the folder is gone. */
	sql?: string;
	status: PrismaStatus;
	/** The file's checksum no longer matches the one recorded when it ran. */
	edited?: boolean;
	finishedAt?: string;
	durationMs?: number;
	/** Prisma does not wrap a migration in a transaction; this many statements ran before a failure. */
	appliedSteps?: number;
	logs?: string;
};

export const PRISMA_DIR = "prisma/migrations";
export const PRISMA_PROVIDER = "postgresql";
export const PRISMA_TARGET = "app_dev";

export const PRISMA_MIGRATIONS: PrismaMigration[] = [
	{
		folder: "20260801102233_init",
		status: "applied",
		finishedAt: "Aug 1, 10:24",
		durationMs: 212,
		sql: `-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
	},
	{
		folder: "20260814151002_add_profile",
		status: "applied",
		finishedAt: "Aug 14, 15:11",
		durationMs: 64,
		sql: `-- CreateTable
CREATE TABLE "Profile" (
    "id" SERIAL NOT NULL,
    "bio" TEXT,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
	},
	{
		folder: "20260902090145_post_published_index",
		status: "applied",
		edited: true,
		finishedAt: "Sep 2, 09:02",
		durationMs: 1840,
		sql: `-- CreateIndex
CREATE INDEX "Post_published_createdAt_idx" ON "Post"("published", "createdAt");`,
	},
	{
		folder: "20260918120000_drop_legacy_session",
		status: "missing",
		finishedAt: "Sep 18, 12:01",
		durationMs: 38,
	},
	{
		folder: "20261003141520_add_role_enum",
		status: "failed",
		appliedSteps: 1,
		durationMs: 27,
		logs: `Database error code: 42701

Database error:
ERROR: column "role" of relation "User" already exists`,
		sql: `-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';`,
	},
	{
		folder: "20261015083000_post_title_length",
		status: "pending",
		sql: `-- AlterTable
ALTER TABLE "Post" ALTER COLUMN "title" SET DATA TYPE VARCHAR(200);`,
	},
	{
		folder: "20261020170512_remove_post_views",
		status: "pending",
		sql: `/*
  Warnings:

  - You are about to drop the column \`views\` on the \`Post\` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Post" DROP COLUMN "views";`,
	},
];

/** `20261003141520_add_role_enum` → `add_role_enum` and `Oct 3, 2026 14:15`. */
export const parseFolder = (folder: string) => {
	const ts = folder.slice(0, 14);
	const date = new Date(
		Date.UTC(
			+ts.slice(0, 4),
			+ts.slice(4, 6) - 1,
			+ts.slice(6, 8),
			+ts.slice(8, 10),
			+ts.slice(10, 12),
		),
	);
	return {
		name: folder.slice(15),
		created: date.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
			timeZone: "UTC",
		}),
	};
};

/** The text of Prisma's `/* Warnings: … *\/` header, one entry per `- ` line. */
export const prismaWarnings = (sql: string) =>
	[
		...(sql.match(/\/\*[\s\S]*?Warnings:([\s\S]*?)\*\//)?.[1] ?? "").matchAll(/^\s*- (.+)$/gm),
	].map((m) => m[1].replaceAll("`", ""));

/** Drops lose data; type changes, new unique indexes and NOT NULL columns without a default can fail on existing rows. */
const riskOf = (sql: string): Risk =>
	/DROP (TABLE|COLUMN|TYPE)/i.test(sql)
		? "destructive"
		: /SET DATA TYPE|CREATE UNIQUE INDEX|ADD COLUMN [^;]*NOT NULL(?! DEFAULT)/i.test(sql)
			? "review"
			: "safe";

const quoted = (sql: string, after: RegExp) =>
	sql.match(new RegExp(`${after.source}\\s+"([^"]+)"`, "i"))?.[1];

/**
 * Prisma writes a `-- CreateTable` / `-- AlterTable` / … comment above each statement, so a
 * migration splits on those. The comment names the step; the SQL fills in the object.
 */
export const prismaSteps = (folder: string, sql: string): ProtoChange[] =>
	sql
		.replace(/\/\*[\s\S]*?\*\/\n?/, "")
		.split(/\n\s*\n(?=-- )/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map((block, i) => {
			const [label = "", ...rest] = block.split("\n");
			const body = rest.join("\n").trim();
			const op = label.replace(/^--\s*/, "");
			const table = quoted(body, /(?:TABLE|ON)/) ?? quoted(body, /TYPE/) ?? "";
			const column =
				quoted(body, /(?:ADD|DROP|ALTER) COLUMN/) ??
				quoted(body, /CONSTRAINT/) ??
				quoted(body, /INDEX/);
			const summary =
				op === "CreateTable"
					? `Create table ${table}`
					: op === "CreateIndex"
						? `Create ${/UNIQUE/i.test(body) ? "unique " : ""}index ${quoted(body, /INDEX/)}`
						: op === "AddForeignKey"
							? `Add foreign key ${column}`
							: op === "CreateEnum"
								? `Create enum ${table}`
								: /DROP COLUMN/i.test(body)
									? `Drop column ${column}`
									: /ADD COLUMN/i.test(body)
										? `Add column ${column}`
										: /SET DATA TYPE/i.test(body)
											? `Change type of ${column} to ${body.match(/SET DATA TYPE ([^;]+)/i)?.[1]}`
											: op;
			return {
				id: `${folder}#${i}`,
				table,
				kind: "other",
				summary,
				sql: body,
				risk: riskOf(body),
				phase: 1,
			} satisfies ProtoChange;
		});

export const PRISMA_COMMANDS = {
	deploy: "npx prisma migrate deploy",
	status: "npx prisma migrate status",
	resolveRolledBack: (folder: string) => `npx prisma migrate resolve --rolled-back ${folder}`,
	resolveApplied: (folder: string) => `npx prisma migrate resolve --applied ${folder}`,
};
