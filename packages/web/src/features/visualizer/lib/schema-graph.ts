import { graphlib, layout } from "@dagrejs/dagre";
import type { SchemaGraphTable } from "@/shared/api";

export type GraphTable = SchemaGraphTable & { id: string };

export type GraphEdge = {
	id: string;
	source: string;
	sourceColumn: string;
	target: string;
	targetColumn: string;
};

export const tableId = ({
	schemaName,
	tableName,
}: {
	schemaName?: string;
	tableName: string;
}) => (schemaName ? `${schemaName}.${tableName}` : tableName);

/**
 * Keeps the tables of the selected schema ("all" keeps every table) and turns each FK
 * column into an edge. FKs into a table outside the selection are dropped.
 */
export const buildSchemaGraph = (tables: SchemaGraphTable[], schema: string) => {
	const visible = (
		schema === "all" ? tables : tables.filter((table) => table.schemaName === schema)
	).map((table) => ({ ...table, id: tableId(table) }));

	// Adapters report the referenced table without its schema: prefer the FK's own schema.
	const resolve = (tableName: string, schemaName?: string) =>
		visible.find((t) => t.tableName === tableName && t.schemaName === schemaName) ??
		visible.find((t) => t.tableName === tableName);

	const edges: GraphEdge[] = visible.flatMap((table) =>
		table.columns.flatMap((column) => {
			const { referencedTable, referencedColumn } = column;
			if (!referencedTable || !referencedColumn) return [];
			const target = resolve(referencedTable, table.schemaName);
			if (!target) return [];
			return {
				id: `${table.id}.${column.columnName}->${target.id}`,
				source: table.id,
				sourceColumn: column.columnName,
				target: target.id,
				targetColumn: referencedColumn,
			};
		}),
	);

	return { tables: visible, edges };
};

/** Left-to-right dagre layout; returns each node's top-left corner. */
export const layoutGraph = (
	nodes: { id: string; width: number; height: number }[],
	edges: GraphEdge[],
) => {
	const graph = new graphlib.Graph();
	graph.setDefaultEdgeLabel(() => ({}));
	graph.setGraph({ rankdir: "LR", ranksep: 160, nodesep: 60 });
	for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height });
	// Reversed so dagre ranks a referenced table left of the tables referencing it.
	for (const edge of edges) graph.setEdge(edge.target, edge.source);
	layout(graph);

	return new Map(
		nodes.map((node) => {
			const { x, y } = graph.node(node.id);
			return [node.id, { x: x - node.width / 2, y: y - node.height / 2 }];
		}),
	);
};

/** The tables, `<table id>.<column>` columns and edges joined to `id` by an FK. */
export const neighbourhood = (edges: GraphEdge[], id: string) => {
	const tables = new Set([id]);
	const columns = new Set<string>();
	const edgeIds = new Set<string>();
	for (const edge of edges) {
		if (edge.source !== id && edge.target !== id) continue;
		tables.add(edge.source).add(edge.target);
		columns
			.add(`${edge.source}.${edge.sourceColumn}`)
			.add(`${edge.target}.${edge.targetColumn}`);
		edgeIds.add(edge.id);
	}
	return { tables, columns, edgeIds };
};

/** Box width from the longest column name and type, clamped to 220–420px. */
export const tableWidth = (table: SchemaGraphTable) => {
	const longest = Math.max(
		table.tableName.length,
		...table.columns.map((c) => c.columnName.length + c.dataTypeLabel.length + 4),
	);
	return Math.min(Math.max(longest * 7.5 + 72, 220), 420);
};
