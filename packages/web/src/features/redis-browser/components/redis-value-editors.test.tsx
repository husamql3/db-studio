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

describe("hash editor filtering", () => {
	it("hides rows whose field and value both miss the filter, case-insensitively", () => {
		renderEditor(hashDetail());
		const filter = screen.getByLabelText("Filter loaded entries");

		// Matches on field text regardless of case.
		fireEvent.change(filter, { target: { value: "BETA" } });
		expect(screen.getByText("beta")).toBeInTheDocument();
		expect(screen.queryByText("alpha")).not.toBeInTheDocument();
		expect(screen.queryByText("gamma")).not.toBeInTheDocument();

		// Matches on value text too: only beta has value "two".
		fireEvent.change(filter, { target: { value: "TWO" } });
		expect(screen.getByText("beta")).toBeInTheDocument();
		expect(screen.queryByText("alpha")).not.toBeInTheDocument();
		expect(screen.queryByText("gamma")).not.toBeInTheDocument();

		// Clearing the filter restores every loaded row.
		fireEvent.change(filter, { target: { value: "" } });
		expect(screen.getByText("alpha")).toBeInTheDocument();
		expect(screen.getByText("beta")).toBeInTheDocument();
		expect(screen.getByText("gamma")).toBeInTheDocument();
	});

	it("shows the filtered-empty message when nothing matches", () => {
		renderEditor(hashDetail());
		fireEvent.change(screen.getByLabelText("Filter loaded entries"), {
			target: { value: "zzz-no-match" },
		});
		expect(screen.getByText("No loaded entries match the filter.")).toBeInTheDocument();
		expect(screen.queryByText("alpha")).not.toBeInTheDocument();
	});
});

describe("hash add form", () => {
	it("submits the encoded pair and clears the inputs on success", async () => {
		const { props } = renderEditor(hashDetail());
		const fieldInput = screen.getByPlaceholderText("field");
		const valueInput = screen.getByPlaceholderText("value");

		fireEvent.change(fieldInput, { target: { value: "delta" } });
		fireEvent.change(valueInput, { target: { value: "four" } });
		fireEvent.click(screen.getByRole("button", { name: "Add" }));

		expect(props.act).toHaveBeenCalledWith({
			action: "upsertHash",
			field: encodeTextValue("delta"),
			value: encodeTextValue("four"),
		});
		await waitFor(() => expect(fieldInput).toHaveValue(""));
		expect(valueInput).toHaveValue("");
	});

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

	it("pushes to the left via the dedicated button", async () => {
		const { props } = renderEditor(listDetail());
		const item = screen.getByPlaceholderText("new item");

		fireEvent.change(item, { target: { value: "fresh" } });
		fireEvent.click(screen.getByRole("button", { name: "Push left" }));

		expect(props.act).toHaveBeenCalledWith({
			action: "pushList",
			side: "left",
			value: encodeTextValue("fresh"),
		});
		await waitFor(() => expect(item).toHaveValue(""));
	});

	it("pushes to the right when the form submits", async () => {
		const { props } = renderEditor(listDetail());
		const item = screen.getByPlaceholderText("new item");

		fireEvent.change(item, { target: { value: "tail" } });
		fireEvent.click(screen.getByRole("button", { name: "Push right" }));

		await waitFor(() =>
			expect(props.act).toHaveBeenCalledWith({
				action: "pushList",
				side: "right",
				value: encodeTextValue("tail"),
			}),
		);
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

describe("stream editor", () => {
	it("reports a direction change when the order toggle flips", () => {
		const { props } = renderEditor(
			makeDetail({
				kind: "stream",
				entries: [
					{
						id: "1-1",
						fields: [{ field: encodeTextValue("event"), value: encodeTextValue("login") }],
					},
				],
			}),
		);
		expect(screen.getByText("Oldest first")).toBeInTheDocument();

		fireEvent.click(screen.getByText("Newest first"));
		expect(props.onStreamDirectionChange).toHaveBeenCalledWith("backward");
	});
});

describe("unknown kinds", () => {
	it("falls back to the metadata-only notice", () => {
		renderEditor(makeDetail({ kind: "unknown" }));
		expect(screen.getByText("Metadata only")).toBeInTheDocument();
		expect(
			screen.getByText("This Redis module type cannot be edited in this release."),
		).toBeInTheDocument();
	});
});
