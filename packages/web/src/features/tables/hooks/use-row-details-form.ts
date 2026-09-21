import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import type { TableRecord } from "@/types/table.type";
import { useRowDetailsStore } from "../stores/row-details.store";
import {
	getIdentityColumnNames,
	getPrimaryKeyColumn,
	getPrimaryKeyColumns,
	getRecordIdentity,
	toFormValues,
} from "../utils/row-details-utils";

/**
 * The row-details draft: the form itself, how it re-syncs against refreshed
 * rows, and the key columns a save must address. Kept apart from the sheet so
 * the synchronization rules can change without touching the rendering.
 */
export const useRowDetailsForm = ({
	tableName,
	tableCols,
	row,
	rowIndex,
}: {
	tableName: string;
	tableCols?: ColumnInfoSchemaType[];
	row: TableRecord | undefined;
	rowIndex: number | null;
}) => {
	const { setDirty } = useRowDetailsStore();

	const primaryKeyColumn = useMemo(() => getPrimaryKeyColumn(tableCols), [tableCols]);
	const primaryKeyColumns = useMemo(() => getPrimaryKeyColumns(tableCols), [tableCols]);
	// The server falls back to an "id" column when no primary key is sent, so
	// saving works for keyless tables that still carry an "id" column. Composite
	// keys are sent in full so the update can only ever match one record.
	const identityColumnNames = useMemo(() => getIdentityColumnNames(tableCols), [tableCols]);
	const columnsSignature = useMemo(
		() => JSON.stringify((tableCols ?? []).map((col) => col.columnName)),
		[tableCols],
	);

	const methods = useForm<Record<string, string>>({
		defaultValues: useMemo(() => toFormValues(row, tableCols), [row, tableCols]),
	});
	const { formState } = methods;
	const isDirty = formState.isDirty;

	// Navigation guards and Live mode both read the draft's dirty state.
	useEffect(() => {
		setDirty(isDirty);
	}, [isDirty, setDirty]);

	const pkDirty = primaryKeyColumns.some((col) =>
		Boolean(formState.dirtyFields[col.columnName]),
	);

	const lastRowRef = useRef<TableRecord | undefined>(undefined);
	const lastRecordIdentityRef = useRef<string | undefined>(undefined);
	const lastRowIndexRef = useRef<number | null>(null);
	const lastTableNameRef = useRef<string | null>(null);
	const lastColsSigRef = useRef<string>(columnsSignature);

	// Synchronize form values with the active row. An untouched draft resets from
	// the refreshed row so displayed values stay consistent. Dirty edits are preserved
	// only when the refreshed row has the same stable record identity.
	useEffect(() => {
		const currentIdentity = getRecordIdentity(row, tableCols);
		const isSameSelection =
			tableName === lastTableNameRef.current &&
			rowIndex === lastRowIndexRef.current &&
			columnsSignature === lastColsSigRef.current;

		if (!isSameSelection) {
			lastTableNameRef.current = tableName;
			lastRowIndexRef.current = rowIndex;
			lastColsSigRef.current = columnsSignature;
			lastRowRef.current = row;
			lastRecordIdentityRef.current = currentIdentity;
			methods.reset(toFormValues(row, tableCols));
			return;
		}

		if (row === lastRowRef.current) {
			return;
		}
		lastRowRef.current = row;

		const freshValues = toFormValues(row, tableCols);

		if (!isDirty) {
			lastRecordIdentityRef.current = currentIdentity;
			methods.reset(freshValues);
			return;
		}

		const sameIdentity =
			currentIdentity !== undefined &&
			lastRecordIdentityRef.current !== undefined &&
			currentIdentity === lastRecordIdentityRef.current;

		if (sameIdentity) {
			methods.reset(freshValues, { keepDirtyValues: true });
		} else {
			lastRecordIdentityRef.current = currentIdentity;
			methods.reset(freshValues);
		}
	}, [row, tableCols, tableName, rowIndex, columnsSignature, methods, isDirty]);

	return {
		methods,
		isDirty,
		pkDirty,
		primaryKeyColumn,
		identityColumnNames,
	};
};
