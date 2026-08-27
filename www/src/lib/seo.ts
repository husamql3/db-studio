import { META } from "@db-studio/shared/constants";

/**
 * Per-route head tags: unique title/description, canonical URL, and
 * matching Open Graph overrides. Root-level tags are deduped by
 * name/property, so these win over the defaults in __root.tsx.
 */
export const seoHead = ({
	title,
	description,
	path,
}: {
	title: string;
	description?: string;
	path: string;
}) => {
	const url = path === "/" ? `${META.SITE_URL}/` : `${META.SITE_URL}${path}`;

	return {
		meta: [
			{ title },
			...(description ? [{ name: "description", content: description }] : []),
			{ property: "og:title", content: title },
			...(description ? [{ property: "og:description", content: description }] : []),
			{ property: "og:url", content: url },
		],
		links: [{ rel: "canonical", href: url }],
	};
};
