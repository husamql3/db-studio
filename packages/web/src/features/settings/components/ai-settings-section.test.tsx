import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSettingsSection } from "./ai-settings-section";

const mocks = vi.hoisted(() => ({
	update: vi.fn(() => Promise.resolve()),
	clear: vi.fn(() => Promise.resolve()),
}));

vi.mock("../byok", () => ({
	aiByok: { update: mocks.update, clear: mocks.clear },
}));
vi.mock("../stores/ai-settings.store", () => ({
	useAiSettingsStore: () => ({
		provider: "openai",
		model: "gpt-5.2",
		includeSchemaInAiContext: true,
		setProvider: vi.fn(),
		setModel: vi.fn(),
		setIncludeSchemaInAiContext: vi.fn(),
	}),
}));
vi.mock("@tanstack/ai-react", () => ({
	useByok: () => ({ status: {}, storageError: null }),
}));

describe("AI settings keys", () => {
	beforeEach(() => vi.clearAllMocks());

	it("updates the key for the selected provider", async () => {
		render(<AiSettingsSection />);

		fireEvent.change(screen.getByLabelText("OpenAI API key"), {
			target: { value: "personal-openai-key" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save key" }));

		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith("openai", "personal-openai-key"),
		);
		expect(screen.getByLabelText("OpenAI API key")).toHaveValue("");
	});
});
