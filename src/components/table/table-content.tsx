export const TableContent = ({ activeTable }: { activeTable: string }) => {
	return (
		<main className="flex-1 flex items-center justify-center text-zinc-100">
			<h2>{activeTable}</h2>
		</main>
	);
};
