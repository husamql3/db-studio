export const TableEmpty = () => {
	return (
		<div className="flex flex-col flex-1 h-full overflow-hidden">
			<div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="opacity-50"
				>
					<title>No data</title>
					<rect
						width="18"
						height="18"
						x="3"
						y="3"
						rx="2"
					/>
					<path d="M3 9h18" />
					<path d="M9 21V9" />
				</svg>
				<div className="text-center">
					<p className="text-sm font-medium">No data in this table</p>
				</div>
			</div>
		</div>
	);
};
