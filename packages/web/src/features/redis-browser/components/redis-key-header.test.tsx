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
	it("shows ∞ for persistent keys", () => {
		renderHeader({ detail: makeDetail({ ttlMs: -1 }) });
		expect(screen.getByText("∞")).toBeInTheDocument();
	});

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

describe("Runner button", () => {
	it("opens the runner when a command is available", () => {
		const handlers = renderHeader({ command: "GET session:42" });
		fireEvent.click(screen.getByRole("button", { name: "Runner" }));
		expect(handlers.onOpenRunner).toHaveBeenCalledTimes(1);
	});

	it("is absent when no command is available", () => {
		renderHeader({ command: null });
		expect(screen.queryByRole("button", { name: "Runner" })).toBeNull();
	});
});

describe("Rename flow", () => {
	it("prefills the current key, blocks unchanged submits, and renames", () => {
		const handlers = renderHeader();
		openEditPopover();

		const input = screen.getByRole("textbox");
		expect(input).toHaveValue("session:42");
		const submit = screen.getByRole("button", { name: "Rename key" });
		expect(submit).toBeDisabled();

		fireEvent.change(input, { target: { value: "session:43" } });
		expect(submit).toBeEnabled();
		fireEvent.click(submit);

		expect(handlers.act).toHaveBeenCalledWith({
			action: "rename",
			newKey: expect.objectContaining({ utf8: "session:43", base64: expect.any(String) }),
		});
	});
});

describe("TTL presets", () => {
	it("maps the 60s preset to a 60000ms setTtl", () => {
		const handlers = renderHeader({ detail: makeDetail({ ttlMs: 90_000 }) });
		openEditPopover();
		fireEvent.click(screen.getByRole("button", { name: "60s" }));
		expect(handlers.act).toHaveBeenCalledWith({ action: "setTtl", ttlMs: 60_000 });
	});

	it("persists the key with a null TTL", () => {
		const handlers = renderHeader({ detail: makeDetail({ ttlMs: 90_000 }) });
		openEditPopover();
		fireEvent.click(screen.getByRole("button", { name: "Persist" }));
		expect(handlers.act).toHaveBeenCalledWith({ action: "setTtl", ttlMs: null });
	});

	it("disables Persist when the key already persists", () => {
		renderHeader({ detail: makeDetail({ ttlMs: -1 }) });
		openEditPopover();
		expect(screen.getByRole("button", { name: "Persist" })).toBeDisabled();
	});
});

describe("Custom TTL", () => {
	it("converts entered seconds to milliseconds", () => {
		const handlers = renderHeader();
		openEditPopover();
		fireEvent.change(screen.getByLabelText("TTL in seconds"), {
			target: { value: "120" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		expect(handlers.act).toHaveBeenCalledWith({ action: "setTtl", ttlMs: 120_000 });
	});

	it("sends a null TTL when the input is empty", () => {
		const handlers = renderHeader();
		openEditPopover();
		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		expect(handlers.act).toHaveBeenCalledWith({ action: "setTtl", ttlMs: null });
	});
});

describe("Delete and Refresh", () => {
	it("wires Delete and Refresh to their handlers", () => {
		const handlers = renderHeader();
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		expect(handlers.onDelete).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
		expect(handlers.onRefresh).toHaveBeenCalledTimes(1);
	});

	it("disables Refresh while a fetch is in flight", () => {
		renderHeader({ isFetching: true });
		expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
	});
});
