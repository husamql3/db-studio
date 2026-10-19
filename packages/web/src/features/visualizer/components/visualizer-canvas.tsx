import "@xyflow/react/dist/style.css";
import { useNavigate } from "@tanstack/react-router";
import {
	Background,
	BackgroundVariant,
	ControlButton,
	Controls,
	type Edge,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	useNodesInitialized,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import { RotateCcw } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { VisualizerLegend } from "@/features/visualizer/components/visualizer-legend";
import {
	HEADER_HEIGHT,
	ROW_HEIGHT,
	type VisualizerTableNode,
	VisualizerTableNodeView,
} from "@/features/visualizer/components/visualizer-table-node";
import {
	type GraphEdge,
	type GraphTable,
	layoutGraph,
	neighbourhood,
	tableWidth,
} from "@/features/visualizer/lib/schema-graph";
import { useTheme } from "@/hooks/use-theme";
import { CONSTANTS } from "@/utils/constants";

const nodeTypes = { table: VisualizerTableNodeView };

type CanvasProps = { tables: GraphTable[]; edges: GraphEdge[] };

const layoutNodes = ({ tables, edges }: CanvasProps): VisualizerTableNode[] => {
	const sized = tables.map((table) => ({
		id: table.id,
		width: tableWidth(table),
		height: HEADER_HEIGHT + table.columns.length * ROW_HEIGHT + 2,
	}));
	const positions = layoutGraph(sized, edges);

	return tables.map((table, i) => ({
		id: table.id,
		type: "table",
		position: positions.get(table.id) ?? { x: 0, y: 0 },
		width: sized[i].width,
		data: { table, active: false, dimmed: false, highlightedColumns: new Set() },
	}));
};

// Referenced (parent) tables sit on the left, so an edge leaves the referenced column's right
// side and enters the FK column's left side.
const toFlowEdge = (edge: GraphEdge, highlighted: boolean, dimmed: boolean): Edge => ({
	id: edge.id,
	source: edge.target,
	sourceHandle: `${edge.targetColumn}-r`,
	target: edge.source,
	targetHandle: `${edge.sourceColumn}-l`,
	type: "smoothstep",
	animated: highlighted,
	zIndex: highlighted ? 1 : 0,
	style: {
		stroke: highlighted ? "var(--primary)" : "var(--muted-foreground)",
		strokeWidth: highlighted ? 2 : 1.25,
		opacity: dimmed ? 0.15 : highlighted ? 1 : 0.55,
	},
});

const Canvas = ({ tables, edges }: CanvasProps) => {
	const { isDark } = useTheme();
	const navigate = useNavigate();
	const { fitView } = useReactFlow();
	const measured = useNodesInitialized();
	const [focused, setFocused] = useQueryState(CONSTANTS.ACTIVE_TABLE, { defaultValue: "" });
	const [search] = useQueryState(CONSTANTS.SIDEBAR_SEARCH, { defaultValue: "" });
	const [hovered, setHovered] = useState<string | null>(null);

	const initial = useMemo(() => layoutNodes({ tables, edges }), [tables, edges]);
	const [nodes, setNodes, onNodesChange] = useNodesState(initial);
	const fitted = useRef(false);
	useEffect(() => {
		setNodes(initial);
		fitted.current = false;
	}, [initial, setNodes]);

	// Pan to a table picked in the sidebar (or the URL), but not to one clicked on the canvas:
	// the click is already where the user is looking.
	const focusedFromCanvas = useRef(false);
	useEffect(() => {
		if (!measured) return;
		if (focused && !focusedFromCanvas.current) {
			void fitView({ nodes: [{ id: focused }], duration: 400, maxZoom: 1.1 });
		} else if (!fitted.current) {
			void fitView();
		}
		fitted.current = true;
		focusedFromCanvas.current = false;
	}, [focused, measured, fitView]);
	const focusFromCanvas = (id: string) => {
		focusedFromCanvas.current = true;
		void setFocused(id || null);
	};

	const activeId = hovered ?? (focused || null);
	const near = activeId ? neighbourhood(edges, activeId) : null;
	const term = search.trim().toLowerCase();

	const displayNodes = nodes.map((node) => ({
		...node,
		data: {
			...node.data,
			active: node.id === focused,
			dimmed:
				(near !== null && !near.tables.has(node.id)) ||
				(term !== "" && !node.data.table.tableName.toLowerCase().includes(term)),
			highlightedColumns: near?.columns ?? new Set<string>(),
		},
	}));
	const displayEdges = edges.map((edge) => {
		const highlighted = near?.edgeIds.has(edge.id) ?? false;
		return toFlowEdge(edge, highlighted, near !== null && !highlighted);
	});

	return (
		<ReactFlow
			nodes={displayNodes}
			edges={displayEdges}
			nodeTypes={nodeTypes}
			onNodesChange={onNodesChange}
			onNodeMouseEnter={(_, node) => setHovered(node.id)}
			onNodeMouseLeave={() => setHovered(null)}
			onNodeClick={(_, node) => focusFromCanvas(node.id === focused ? "" : node.id)}
			onNodeDoubleClick={(_, node) =>
				void navigate({
					to: "/table/$table",
					params: { table: node.data.table.tableName },
					search: { [CONSTANTS.TABLE_SCHEMA]: node.data.table.schemaName },
				})
			}
			onPaneClick={() => focusFromCanvas("")}
			nodesConnectable={false}
			colorMode={isDark ? "dark" : "light"}
			minZoom={0.1}
			maxZoom={2}
			proOptions={{ hideAttribution: true }}
			className="bg-background!"
		>
			<Background
				variant={BackgroundVariant.Dots}
				gap={18}
				size={1.5}
			/>
			<Controls
				position="top-right"
				showInteractive={false}
			>
				<ControlButton
					title="Reset layout"
					aria-label="Reset layout"
					onClick={() => {
						setNodes(initial);
						void fitView({ duration: 300 });
					}}
				>
					<RotateCcw />
				</ControlButton>
			</Controls>
			<MiniMap
				pannable
				zoomable
			/>
			<VisualizerLegend />
		</ReactFlow>
	);
};

export const VisualizerCanvas = (props: CanvasProps) => (
	<ReactFlowProvider>
		<Canvas {...props} />
	</ReactFlowProvider>
);
