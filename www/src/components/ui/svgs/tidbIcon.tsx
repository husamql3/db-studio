import type { SVGProps } from "react";

const TidbIcon = (props: SVGProps<SVGSVGElement>) => (
	<svg
		{...props}
		viewBox="0 0 24 24"
	>
		<path
			fill="#DC150B"
			d="M12 0 1.609 6.001v11.998L11.999 24l10.393-6.001V6.001ZM8.535 17.999v-7.998L5.07 12V8L12 4l3.462 2-3.464 2.001v12Zm6.93 0v-7.997l3.464-2v7.997z"
		/>
	</svg>
);

export { TidbIcon };
