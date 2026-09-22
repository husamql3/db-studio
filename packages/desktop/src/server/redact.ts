// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes start with ESC (0x1b)
const ANSI_PATTERN = /\[[0-9;]*[A-Za-z]/g;
const CREDENTIALS_PATTERN = /(\w+:\/\/)([^\s/@]+)@/g;
const DECORATION_ONLY = /^[─-╿◆◇\s]+$/;

/** Strips terminal colors and `user:password@` segments from server child output. */
export const redactOutput = (text: string): string =>
	text.replace(ANSI_PATTERN, "").replace(CREDENTIALS_PATTERN, "$1***@");

/** Last meaningful lines of child output, suitable as an error message. */
export const summarizeOutput = (lines: string[], max = 4): string =>
	lines
		.map((line) => redactOutput(line).trim())
		.filter((line) => line && !DECORATION_ONLY.test(line))
		.slice(-max)
		.join("\n");
