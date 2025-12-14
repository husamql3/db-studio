import { faker } from "@faker-js/faker";
import type { ColumnDef } from "@tanstack/react-table";

export const makeColumns = (num: number): ColumnDef<Record<string, unknown>, unknown>[] =>
	[...Array(num)].map((_, i) => {
		return {
			accessorKey: i.toString(),
			header: `Column ${i.toString()}`,
			size: Math.floor(Math.random() * 150) + 100,
		};
	});

export const makeData = (
	num: number,
	columns: ColumnDef<Record<string, unknown>, unknown>[],
): Record<string, unknown>[] =>
	[...Array(num)].map(() => ({
		...Object.fromEntries(
			columns.map((col) => [
				(col as unknown as { accessorKey: string }).accessorKey,
				faker.person.firstName(),
			]),
		),
	}));

export type Person = {
	[key: string]: unknown;
};
