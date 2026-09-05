import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "./chat";

const mocks = vi.hoisted(() => ({
	byokStatus: { state: "set", masked: "••••1234" },
	useRateLimit: vi.fn(() => ({
		rateLimit: { limit: 0, used: 0, remaining: 0 },
		isLoadingRateLimit: false,
	})),
}));

vi.mock("@/components/chat/chat-sidebar", () => ({ ChatSidebar: () => null }));
vi.mock("@/hooks/use-rate-limit", () => ({
	useRateLimit: mocks.useRateLimit,
}));
vi.mock("@/stores/database.store", () => ({
	useDatabaseStore: () => ({ dbType: "pg" }),
}));
vi.mock("@/stores/overlay.store", () => ({
	useOverlayStore: () => ({ openOverlay: vi.fn() }),
}));
vi.mock("@/features/settings", () => ({
	aiByok: {},
	useAiByokReady: () => true,
	useAiSettingsStore: () => ({ provider: "openai" }),
}));
vi.mock("@tanstack/ai-react", () => ({
	useByok: () => ({ status: { openai: mocks.byokStatus } }),
}));

describe("Chat status indicator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.byokStatus = { state: "set", masked: "••••1234" };
	});

	it("is available when the selected provider has a personal key", () => {
		render(<Chat />);

		expect(screen.getByTestId("chat-status-indicator")).toHaveClass("bg-emerald-500");
		expect(mocks.useRateLimit).toHaveBeenCalledWith({ enabled: false });
	});

	it("does not fetch the hosted Gemini limit for another provider", () => {
		mocks.byokStatus = { state: "empty", masked: "" };

		render(<Chat />);

		expect(mocks.useRateLimit).toHaveBeenCalledWith({ enabled: false });
	});
});
