import type { SVGProps } from "react";

const ClickhouseIcon = (props: SVGProps<SVGSVGElement>) => (
	<svg
		{...props}
		viewBox="0 0 24 24"
	>
		<path
			fill="#FFCC01"
			d="M21.333 10H24v4h-2.667ZM16 1.335h2.667v21.33H16Zm-5.333 0h2.666v21.33h-2.666ZM0 22.665V1.335h2.667v21.33zm5.333-21.33H8v21.33H5.333Z"
		/>
	</svg>
);

export { ClickhouseIcon };
