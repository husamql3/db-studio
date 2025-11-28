export const FieldError = ({ error }: { error?: string }) => {
	return error ? (
		<span role="alert" className="text-sm text-red-500">
			{error}
		</span>
	) : null;
};
