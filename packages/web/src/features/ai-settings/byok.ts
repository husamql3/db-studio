import { defaultByokStorage, defineByok } from "@tanstack/ai-client/byok";

export const aiByok = defineByok({
	storage: defaultByokStorage(),
});

aiByok.setServerCoverage({ gemini: true });
