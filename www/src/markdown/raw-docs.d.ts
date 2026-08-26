declare module "virtual:raw-docs" {
	/** Raw text of content/docs/*.mdx keyed by file name without extension. */
	const docs: Record<string, string>;
	export default docs;
}
