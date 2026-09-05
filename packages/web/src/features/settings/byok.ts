import { defineByok, memoryStorage } from "@tanstack/ai-client/byok";

export const aiByok = defineByok({
	storage: memoryStorage(),
});

aiByok.setServerCoverage({ gemini: true });
