import { Input } from "@db-studio/ui/input";
import type { ComponentProps } from "react";

export const DefaultValueField = ({
	invalid,
	...props
}: ComponentProps<typeof Input> & { invalid: boolean }) => (
	<div className="flex flex-col gap-2">
		<Input
			placeholder="NULL"
			className={invalid ? "border-destructive ring-destructive ring-1" : ""}
			{...props}
		/>
	</div>
);
