"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { annotate } from "rough-notation";
import type { RoughAnnotation } from "rough-notation/lib/model";

type AnnotationAction =
	| "highlight"
	| "underline"
	| "box"
	| "circle"
	| "strike-through"
	| "crossed-off"
	| "bracket";

interface HighlighterProps {
	children: React.ReactNode;
	action?: AnnotationAction;
	color?: string;
	strokeWidth?: number;
	animationDuration?: number;
	iterations?: number;
	padding?: number;
	multiline?: boolean;
}

export function Highlighter({
	children,
	action = "highlight",
	color = "#ffd1dc",
	strokeWidth = 1.5,
	animationDuration = 1000,
	iterations = 3,
	padding = 2,
	multiline = true,
}: HighlighterProps) {
	const elementRef = useRef<HTMLSpanElement>(null);
	const annotationRef = useRef<RoughAnnotation | null>(null);

	useEffect(() => {
		const element = elementRef.current;
		if (!element) return;

		const annotationConfig = {
			type: action,
			color,
			strokeWidth,
			animationDuration,
			iterations,
			padding,
			multiline,
		};

		const annotation = annotate(element, annotationConfig);

		annotationRef.current = annotation;
		annotationRef.current.show();

		const resizeObserver = new ResizeObserver(() => {
			annotation.hide();
			annotation.show();
		});

		resizeObserver.observe(element);
		resizeObserver.observe(document.body);

		return () => {
			if (element) {
				annotate(element, { type: action }).remove();
				resizeObserver.disconnect();
			}
		};
	}, [
		action,
		color,
		strokeWidth,
		animationDuration,
		iterations,
		padding,
		multiline,
	]);

	return (
		<span className="mx-1">
			<span
				ref={elementRef}
				className="relative inline-block bg-transparent md:text-xl text-base px-2"
			>
				{children}
			</span>
		</span>
	);
}
