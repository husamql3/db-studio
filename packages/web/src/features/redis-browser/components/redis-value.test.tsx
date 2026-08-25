import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	base64UrlFromBytes,
	bytesFromBase64Url,
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
});
