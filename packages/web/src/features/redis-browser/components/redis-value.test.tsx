import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	base64UrlFromBytes,
	bytesFromBase64Url,
	encodeBytesValue,
	encodeTextValue,
	RedisValue,
	RedisValueInput,
} from "./redis-value";

describe("Redis binary values", () => {
	it("round-trips arbitrary bytes through base64url", () => {
		const bytes = Uint8Array.from([0, 255, 16, 128, 65]);
		expect(bytesFromBase64Url(base64UrlFromBytes(bytes))).toEqual(bytes);
	});

	it("defaults binary data to an exact hex representation", () => {
		render(<RedisValue value={{ base64: "_wBB" }} />);
		expect(screen.getByText("ff0041")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Download original bytes" })).toBeEnabled();
	});

	it("recognizes and pretty-prints JSON strings", () => {
		render(<RedisValue value={encodeTextValue('{"ok":true}')} />);
		expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
	});

	it("falls back to text when a selected JSON value stops being JSON", () => {
		const { rerender } = render(<RedisValue value={encodeTextValue('{"ok":true}')} />);

		rerender(<RedisValue value={encodeTextValue("plain text now")} />);

		expect(screen.getByText("plain text now")).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "View value as text" })).toHaveAttribute(
			"data-state",
			"on",
		);
	});

	it("emits encoded text changes without losing unicode", () => {
		const onChange = vi.fn();
		render(
			<RedisValueInput
				value={encodeTextValue("")}
				onChange={onChange}
			/>,
		);
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "مرحبا 🥑" } });
		const encoded = onChange.mock.calls[0][0];
		expect(encoded.utf8).toBe("مرحبا 🥑");
		expect(new TextDecoder().decode(bytesFromBase64Url(encoded.base64))).toBe("مرحبا 🥑");
	});

	it("keeps utf8 alongside bytes so encoding switches stay in sync", () => {
		expect(encodeBytesValue(new TextEncoder().encode("task"))).toEqual({
			base64: "dGFzaw",
			utf8: "task",
		});
		// 0xFF is not valid UTF-8: no utf8 representation.
		expect(encodeBytesValue(Uint8Array.from([255, 0]))).toEqual({ base64: "_wA" });
	});
});

describe("RedisValueInput invalid drafts", () => {
	/** Binary value (no utf8) mounts the input in hex mode. */
	const binary = { base64: base64UrlFromBytes(Uint8Array.from([255, 0, 65])) };

	it("commits null for unparseable hex instead of keeping the stale value", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<RedisValueInput
				value={binary}
				onChange={onChange}
			/>,
		);
		const input = screen.getByRole("textbox");

		fireEvent.change(input, { target: { value: "fsdasfdadsa" } });
		expect(onChange).toHaveBeenLastCalledWith(null);

		// The parent reflects the invalid commit; the draft and an invalid
		// marker stay visible instead of silently diverging.
		rerender(
			<RedisValueInput
				value={null}
				onChange={onChange}
			/>,
		);
		expect(input).toHaveValue("fsdasfdadsa");
		expect(input).toHaveAttribute("aria-invalid", "true");
	});

	it("recovers once the hex draft parses again", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<RedisValueInput
				value={binary}
				onChange={onChange}
			/>,
		);
		const input = screen.getByRole("textbox");

		fireEvent.change(input, { target: { value: "zz" } });
		expect(onChange).toHaveBeenLastCalledWith(null);
		rerender(
			<RedisValueInput
				value={null}
				onChange={onChange}
			/>,
		);

		fireEvent.change(input, { target: { value: "ff00" } });
		expect(onChange).toHaveBeenLastCalledWith({
			base64: base64UrlFromBytes(Uint8Array.from([255, 0])),
		});
		rerender(
			<RedisValueInput
				value={onChange.mock.lastCall?.[0]}
				onChange={onChange}
			/>,
		);
		expect(input).not.toHaveAttribute("aria-invalid");
	});
});
