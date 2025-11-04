import { useState } from "react";
import { Header } from "./components/layout/header";
import { Sidebar } from "./components/layout/sidebar";
import { MainView } from "./components/main-view";
import { cn } from "./utils/cn";

const App = () => {
	const [isPinned, setIsPinned] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="bg-zinc-950 h-screen w-full flex">
			<Sidebar isOpen={isOpen} setIsOpen={setIsOpen} isPinned={isPinned} setIsPinned={setIsPinned} />

			<div className={cn("flex-1 flex flex-col transition-all duration-300 ease-out", isPinned ? "ml-[260px]" : "")}>
				<Header isOpen={isOpen} setIsOpen={setIsOpen} />

				<MainView />
			</div>
		</div>
	);
};

export default App;
