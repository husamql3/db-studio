import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const SidebarToggleButton = () => {
	const {
		sidebar: { isOpen },
		setSidebarOpen,
	} = usePersonalPreferencesStore();

	return (
		<button
			type="button"
			onClick={() => setSidebarOpen(!isOpen)}
			className="aspect-square size-14 border-r border-zinc-800 flex items-center justify-center text-sm font-medium hover:bg-zinc-900 transition-colors text-zinc-400"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				className="size-6"
			>
				<path
					d="M3 8.25V18C3 18.5967 3.23705 19.169 3.65901 19.591C4.08097 20.0129 4.65326 20.25 5.25 20.25H18.75C19.3467 20.25 19.919 20.0129 20.341 19.591C20.7629 19.169 21 18.5967 21 18V8.25M3 8.25V6C3 5.40326 3.23705 4.83097 3.65901 4.40901C4.08097 3.98705 4.65326 3.75 5.25 3.75H18.75C19.3467 3.75 19.919 3.98705 20.341 4.40901C20.7629 4.83097 21 5.40326 21 6V8.25M3 8.25H21M5.25 6H5.258V6.008H5.25V6ZM7.5 6H7.508V6.008H7.5V6ZM9.75 6H9.758V6.008H9.75V6Z"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<title>Open sidebar</title>
				<path
					className="icon-bar"
					d="M4.75 10H11V18.5H5.75C5.19772 18.5 4.75 18.0523 4.75 17.5V10Z"
					fill="currentColor"
				/>
			</svg>
		</button>
	);
};
