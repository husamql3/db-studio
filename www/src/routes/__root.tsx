import { META } from "@db-studio/shared/constants";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { NotFound } from "@/components/not-found";
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ title: META.SITE_TITLE },
			{ name: "author", content: META.AUTHOR_NAME },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{
				name: "description",
				content: META.SITE_DESCRIPTION,
			},
			{ name: "robots", content: "index, follow" },
			// Open Graph for social sharing & AI previews
			{
				property: "og:title",
				content: `${META.SITE_NAME} – ${META.SITE_DESCRIPTION}`,
			},
			{
				property: "og:description",
				content: META.SITE_DESCRIPTION,
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: META.SITE_URL },
			{ property: "og:site_name", content: META.SITE_NAME },
			{ property: "og:image", content: META.SITE_IMAGE },
			{ property: "og:image:width", content: META.SITE_IMAGE_WIDTH },
			{ property: "og:image:height", content: META.SITE_IMAGE_HEIGHT },
			{
				property: "og:image:alt",
				content: `${META.SITE_NAME} – ${META.SITE_DESCRIPTION}`,
			},
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "manifest", href: "/manifest.json" },
			{ rel: "icon", href: "/favicon.ico" },
			{ rel: "sitemap", href: "/sitemap.xml" },
		],
	}),
	shellComponent: RootDocument,
	notFoundComponent: () => <NotFound />,
});

const structuredData = JSON.stringify({
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "WebSite",
			"@id": `${META.SITE_URL}/#website`,
			url: META.SITE_URL,
			name: META.SITE_TITLE,
			description: META.SITE_DESCRIPTION,
			publisher: { "@id": `${META.SITE_URL}/#organization` },
		},
		{
			"@type": "Organization",
			"@id": `${META.SITE_URL}/#organization`,
			name: META.SITE_TITLE,
			url: META.SITE_URL,
			logo: `${META.SITE_URL}/logo.png`,
			sameAs: [META.SITE_X_LINK, META.SITE_GITHUB_LINK],
		},
		{
			"@type": "SoftwareApplication",
			"@id": `${META.SITE_URL}/#software`,
			name: META.SITE_TITLE,
			description: META.SITE_DESCRIPTION,
			url: META.SITE_URL,
			applicationCategory: "DeveloperApplication",
			operatingSystem: "macOS, Windows, Linux",
			offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
			softwareHelp: { "@type": "CreativeWork", url: META.SITE_DOCS_LINK },
			publisher: { "@id": `${META.SITE_URL}/#organization` },
		},
	],
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html
			lang="en"
			className="scheme-only-dark"
		>
			<head>
				<HeadContent />
				<script
					type="application/ld+json"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD built from META constants
					dangerouslySetInnerHTML={{ __html: structuredData }}
				/>
			</head>
			<body className="dark .dark">
				<RootProvider>{children}</RootProvider>

				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
