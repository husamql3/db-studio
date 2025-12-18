export const FieldError = ({ error }: { error?: string }) => {
	return (
		<span
			role="alert"
			className="text-sm text-destructive"
		>
			{error}
		</span>
	);
};
