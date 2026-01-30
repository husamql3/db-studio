export async function readSseText(response: Response): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let output = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (!line.startsWith("data: ")) continue;
			const data = line.slice(6).trim();
			if (!data || data === "[DONE]") continue;
			const chunk = JSON.parse(data) as {
				type?: string;
				delta?: string;
				content?: string;
				error?: { message?: string };
			};
			if (chunk.type === "error") {
				throw new Error(chunk.error?.message ?? "AI stream error");
			}
			if (typeof chunk.delta === "string") {
				output += chunk.delta;
			} else if (typeof chunk.content === "string") {
				output += chunk.content;
			}
		}
	}

	return output.trim();
}
