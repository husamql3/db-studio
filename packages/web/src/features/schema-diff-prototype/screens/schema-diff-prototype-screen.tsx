// PROTOTYPE — throwaway. /migrations has two views:
// - `?view=prisma` (default): the project's Prisma migrations on the timeline.
// - `?view=compare`: db-studio's own source → target comparisons; `?graph=` switches the
//   step-list layout there. Variants A and B lost; their files stay on this branch for reference.
import { useState } from "react";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { FROM_DB, MIGRATIONS, TO_DB } from "../fixture";
import { PrismaScreen } from "../prisma-screen";
import { STEP_VARIANTS, VariantC } from "../variant-c-plan";

export const SchemaDiffPrototypeScreen = ({
	view,
	migrationId,
	graph,
	onGraph,
}: {
	view: string;
	migrationId?: string;
	graph: string;
	onGraph: (key: string) => void;
}) => {
	const [from, setFrom] = useState(FROM_DB);
	const [to, setTo] = useState(TO_DB);

	if (view === "prisma") return <PrismaScreen selected={migrationId} />;

	const migration = MIGRATIONS.find((m) => m.id === migrationId) ?? MIGRATIONS[1];
	return (
		<>
			<VariantC
				key={migration.id}
				migration={migration}
				graph={graph}
				from={from}
				to={to}
				onFrom={setFrom}
				onTo={setTo}
			/>
			<PrototypeSwitcher
				variants={STEP_VARIANTS}
				current={graph}
				onChange={onGraph}
			/>
		</>
	);
};
