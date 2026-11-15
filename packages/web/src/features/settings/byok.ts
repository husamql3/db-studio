import type { AiProvider } from "@db-studio/shared/types";
import { defineByok, memoryStorage } from "@tanstack/ai-client/byok";

/** The provider the server holds a key for, with a shared message quota. */
export const HOSTED_AI_PROVIDER = "gemini" satisfies AiProvider;

export const aiByok = defineByok({
	storage: memoryStorage(),
});

aiByok.setServerCoverage({ [HOSTED_AI_PROVIDER]: true });
