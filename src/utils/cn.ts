export function cn(...args: (string | undefined)[]) {
	return args.filter(Boolean).join(" ");
}
