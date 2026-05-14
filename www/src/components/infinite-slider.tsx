"use client";
import {
	type AnimationPlaybackControls,
	animate,
	domAnimation,
	LazyMotion,
	m,
	useMotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

export type InfiniteSliderProps = {
	children: React.ReactNode;
	gap?: number;
	speed?: number;
	speedOnHover?: number;
	direction?: "horizontal" | "vertical";
	reverse?: boolean;
	className?: string;
};

export function InfiniteSlider({
	children,
	gap = 16,
	speed = 100,
	speedOnHover,
	direction = "horizontal",
	reverse = false,
	className,
}: InfiniteSliderProps) {
	const currentSpeedRef = useRef(speed);
	const [ref, { width, height }] = useMeasure();
	const translation = useMotionValue(0);
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [key, setKey] = useState(0);

	useEffect(() => {
		let controls: AnimationPlaybackControls | null = null;
		const size = direction === "horizontal" ? width : height;
		const contentSize = size + gap;
		const from = reverse ? -contentSize / 2 : 0;
		const to = reverse ? 0 : -contentSize / 2;

		const distanceToTravel = Math.abs(to - from);
		const duration = distanceToTravel / currentSpeedRef.current;

		if (isTransitioning) {
			const remainingDistance = Math.abs(translation.get() - to);
			const transitionDuration = remainingDistance / currentSpeedRef.current;

			controls = animate(translation, [translation.get(), to], {
				ease: "linear",
				duration: transitionDuration,
				onComplete: () => {
					setIsTransitioning(false);
					setKey((prevKey) => prevKey + 1);
				},
			});
		} else {
			controls = animate(translation, [from, to], {
				ease: "linear",
				duration: duration,
				repeat: Infinity,
				repeatType: "loop",
				repeatDelay: 0,
				onRepeat: () => {
					translation.set(from);
				},
			});
		}

		return controls?.stop;
	}, [key, translation, width, height, gap, isTransitioning, direction, reverse]);

	const hoverProps = speedOnHover
		? {
				onHoverStart: () => {
					currentSpeedRef.current = speedOnHover;
					setIsTransitioning(true);
				},
				onHoverEnd: () => {
					currentSpeedRef.current = speed;
					setIsTransitioning(true);
				},
			}
		: {};

	return (
		<LazyMotion features={domAnimation}>
			<div className={cn("overflow-hidden", className)}>
				<m.div
					className="flex w-max"
					style={{
						...(direction === "horizontal" ? { x: translation } : { y: translation }),
						gap: `${gap}px`,
						flexDirection: direction === "horizontal" ? "row" : "column",
					}}
					ref={ref}
					{...hoverProps}
				>
					{children}
					{children}
				</m.div>
			</div>
		</LazyMotion>
	);
}
