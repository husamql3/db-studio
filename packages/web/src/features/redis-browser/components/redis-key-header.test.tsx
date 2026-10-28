import type { KeyDetailsResultSchemaType } from "@db-studio/shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { RedisKeyHeader } from "./redis-key-header";
import { encodeTextValue } from "./redis-value";

const makeDetail = (
	overrides: Partial<KeyDetailsResultSchemaType> = {},
): KeyDetailsResultSchemaType => ({
	key: encodeTextValue("session:42"),
	type: "string",
	ttlMs: -1,
	memoryBytes: 128,
	length: 1,
	revision: "0123456789abcdef",
	value: { kind: "string", value: encodeTextValue("v"), truncated: false },
	nextCursor: null,
	hasMore: false,
	...overrides,
});

type HeaderProps = Parameters<typeof RedisKeyHeader>[0];

const renderHeader = (props: Partial<HeaderProps> = {}) => {
	const handlers = {
		act: vi.fn().mockResolvedValue(true),
		onRefresh: vi.fn(),
		onOpenRunner: vi.fn(),
		onDelete: vi.fn(),
	};
	const detail = props.detail ?? makeDetail();
	render(
		<RedisKeyHeader
			detail={detail}
			label={detail.key.utf8 ?? detail.key.base64}
			loadedCount={null}
			fetchedAt={Date.now()}
			isFetching={false}
			pending={false}
			command={null}
			{...handlers}
			{...props}
		/>,
	);
	return handlers;
};

const openEditPopover = () => {
	fireEvent.click(screen.getByRole("button", { name: "Edit" }));
};

describe("TTL stat", () => {
	it("counts a positive TTL down live", () => {
		vi.useFakeTimers();
		try {
			renderHeader({
				detail: makeDetail({ ttlMs: 90_000 }),
				fetchedAt: Date.now(),
			});
			expect(screen.getByText("1m 30s")).toBeInTheDocument();
			act(() => {
				vi.advanceTimersByTime(61_000);
			});
			expect(screen.queryByText("1m 30s")).toBeNull();
			expect(screen.getByText("29s")).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
		}
	});

	it("shows expired once the TTL has elapsed", () => {
		renderHeader({
			detail: makeDetail({ ttlMs: 90_000 }),
			fetchedAt: Date.now() - 200_000,
		});
		expect(screen.getByText("expired")).toBeInTheDocument();
	});
});

describe("Rename flow", () => {
	it("preserves a binary key when opening the rename editor", () => {
		const handlers = renderHeader({ detail: makeDetail({ key: { base64: "_wA" } }) });
		openEditPopover();

		const input = screen.getByRole("textbox");
		expect(input).toHaveValue("ff00");
		expect(screen.getByRole("button", { name: "Rename key" })).toBeDisabled();

		fireEvent.change(input, { target: { value: "ff01" } });
		fireEvent.click(screen.getByRole("button", { name: "Rename key" }));
		expect(handlers.act).toHaveBeenCalledWith({
			action: "rename",
			newKey: { base64: "_wE" },
		});
	});
});
