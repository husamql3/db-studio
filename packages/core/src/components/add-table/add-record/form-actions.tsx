import { Button } from "@/components/ui/button";

export const FormActions = ({
	onCancel,
	isLoading,
}: {
	onCancel: () => void;
	isLoading: boolean;
}) => {
	return (
		<div className="flex justify-end gap-2">
			<Button
				type="button"
				variant="outline"
				size="lg"
				onClick={onCancel}
				disabled={isLoading}
			>
				Cancel
			</Button>

			<Button
				type="submit"
				variant="default"
				size="lg"
				disabled={isLoading}
			>
				Save
			</Button>
		</div>
	);
};
