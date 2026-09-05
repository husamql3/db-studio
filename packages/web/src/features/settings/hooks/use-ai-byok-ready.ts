import { useEffect, useState } from "react";
import { aiByok } from "../byok";

export const useAiByokReady = () => {
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		let active = true;
		void aiByok.ready().then(() => {
			if (active) setIsReady(true);
		});
		return () => {
			active = false;
		};
	}, []);

	return isReady;
};
