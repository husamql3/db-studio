import { Checkbox } from "@db-studio/ui/checkbox";

export const PrimaryField = ({
	id,
	checked,
	onCheckedChange,
}: {
	id: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) => (
	<div className="flex flex-1 items-center justify-start">
		<Checkbox
			id={id}
			checked={checked}
			onCheckedChange={(value) => onCheckedChange(value === true)}
			className="size-5"
		/>
	</div>
);
