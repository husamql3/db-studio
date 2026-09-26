import path from "node:path";

/**
 * Maps a request pathname onto a file inside the web build, falling back to index.html for
 * SPA routes and for anything that tries to escape the root.
 */
export const resolveStaticFile = (
	root: string,
	pathname: string,
	isFile: (filePath: string) => boolean,
): string => {
	const index = path.join(root, "index.html");
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return index;
	}
	const candidate = path.normalize(path.join(root, decoded));
	const inside = candidate === root || candidate.startsWith(root + path.sep);
	if (!inside) return index;
	return isFile(candidate) ? candidate : index;
};
