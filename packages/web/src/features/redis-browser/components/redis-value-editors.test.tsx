import type { KeyDetailsResultSchemaType } from "@db-studio/shared/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { base64UrlFromBytes, encodeTextValue } from "./redis-value";
import { type RedisAct, RedisValueEditor, type StreamDirection } from "./redis-value-editors";

const makeDetail = (
	value: KeyDetailsResultSchemaType["value"],
	overrides: Partial<Omit<KeyDetailsResultSchemaType, "value">> = {},
): KeyDetailsResultSchemaType => ({
	key: encodeTextValue("test-key"),
	type: value.kind,
	ttlMs: -1,
	memoryBytes: 64,
	length:
		"entries" in value
			? value.entries.length
			: "members" in value
				? value.members.length
				: null,
	revision: "rev-1",
	value,
	nextCursor: null,
	hasMore: false,
	...overrides,
});

const hashDetail = () =>
	makeDetail({
		kind: "hash",
		entries: [
			{ field: encodeTextValue("alpha"), value: encodeTextValue("one") },
			{ field: encodeTextValue("beta"), value: encodeTextValue("two") },
			{ field: encodeTextValue("gamma"), value: encodeTextValue("three") },
		],
	});

const renderEditor = (
	detail: KeyDetailsResultSchemaType,
	overrides: { act?: RedisAct; streamDirection?: StreamDirection } = {},
) => {
	const act = overrides.act ?? vi.fn<RedisAct>().mockResolvedValue(true);
	const props = {
		detail,
		act,
		pending: false,
		onLoadFull: vi.fn(),
		onDownload: vi.fn(),
		streamDirection: overrides.streamDirection ?? ("forward" as const),
		onStreamDirectionChange: vi.fn(),
	};
	const view = render(<RedisValueEditor {...props} />);
	return { ...view, props };
};

describe("hash add form", () => {
	it("keeps the typed pair when the save fails", async () => {
		const act = vi.fn<RedisAct>().mockResolvedValue(false);
		renderEditor(hashDetail(), { act });
		const fieldInput = screen.getByPlaceholderText("field");
		const valueInput = screen.getByPlaceholderText("value");

		fireEvent.change(fieldInput, { target: { value: "delta" } });
		fireEvent.change(valueInput, { target: { value: "four" } });
		fireEvent.click(screen.getByRole("button", { name: "Add" }));

		await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
		expect(fieldInput).toHaveValue("delta");
		expect(valueInput).toHaveValue("four");
	});
});

describe("hash row editing", () => {
	const singleRow = () =>
		makeDetail({
			kind: "hash",
			entries: [{ field: encodeTextValue("alpha"), value: encodeTextValue("one") }],
		});

	it("enables the save button only once the draft diverges, then saves the edit", () => {
		const { props } = renderEditor(singleRow());
		const save = screen.getByRole("button", { name: "Save hash value" });
		expect(save).toBeDisabled();

		fireEvent.change(screen.getByDisplayValue("one"), { target: { value: "uno" } });
		expect(save).toBeEnabled();

		fireEvent.click(save);
		expect(props.act).toHaveBeenCalledWith({
			action: "upsertHash",
			field: encodeTextValue("alpha"),
			value: encodeTextValue("uno"),
		});
	});

	it("replaces a stale draft when the server value changes", () => {
		const { props, rerender } = renderEditor(singleRow());

		// Dirty the local draft first so the resync has something to overwrite.
		fireEvent.change(screen.getByDisplayValue("one"), { target: { value: "edited" } });
		expect(screen.getByDisplayValue("edited")).toBeInTheDocument();

		const refreshed = makeDetail(
			{
				kind: "hash",
				entries: [{ field: encodeTextValue("alpha"), value: encodeTextValue("two") }],
			},
			{ revision: "rev-2" },
		);
		rerender(
			<RedisValueEditor
				{...props}
				detail={refreshed}
			/>,
		);

		expect(screen.getByDisplayValue("two")).toBeInTheDocument();
		expect(screen.queryByDisplayValue("edited")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save hash value" })).toBeDisabled();
	});
});

describe("list editor pushes", () => {
	const listDetail = () =>
		makeDetail({
			kind: "list",
			entries: [{ index: 0, value: encodeTextValue("first") }],
		});

	it("disables both push buttons while the hex draft is unparseable", async () => {
		const { props } = renderEditor(listDetail());
		const item = screen.getByPlaceholderText("new item");

		// The footer input starts in text mode; switch it to hex.
		const encodingSelects = screen.getAllByRole("combobox", { name: "Value encoding" });
		const footerSelect = encodingSelects[encodingSelects.length - 1];
		fireEvent.keyDown(footerSelect, { key: "Enter" });
		fireEvent.click(await screen.findByRole("option", { name: "Hex" }));

		// Keyboard-mash "hex" has no byte representation: nothing may be pushed.
		fireEvent.change(item, { target: { value: "fsdasfdadsa" } });
		expect(item).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByRole("button", { name: "Push left" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Push right" })).toBeDisabled();
		fireEvent.submit(item.closest("form") as HTMLFormElement);
		expect(props.act).not.toHaveBeenCalled();

		// A parseable hex draft re-enables pushing and sends the real bytes.
		fireEvent.change(item, { target: { value: "ff00" } });
		expect(screen.getByRole("button", { name: "Push right" })).toBeEnabled();
		fireEvent.click(screen.getByRole("button", { name: "Push right" }));
		await waitFor(() =>
			expect(props.act).toHaveBeenCalledWith({
				action: "pushList",
				side: "right",
				value: { base64: base64UrlFromBytes(Uint8Array.from([255, 0])) },
			}),
		);
	});
});
