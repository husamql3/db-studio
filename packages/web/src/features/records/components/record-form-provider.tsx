import type { ReactNode } from "react";
import { type FieldValues, FormProvider, type UseFormReturn } from "react-hook-form";
import { RecordReferenceSheet } from "./record-reference-sheet";

/**
 * The form context `AddRecordField` needs: its foreign-key picker opens `RecordReferenceSheet`,
 * which writes the chosen value back through this form.
 */
export const RecordFormProvider = <T extends FieldValues>({
	methods,
	children,
}: {
	methods: UseFormReturn<T>;
	children: ReactNode;
}) => (
	<FormProvider {...methods}>
		{children}
		<RecordReferenceSheet />
	</FormProvider>
);
