import { META } from "shared/constants";
import { NotFound } from "@/components/not-found";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ title: META.SITE_TITLE },
			{ author: META.AUTHOR },
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
			{ rel: "manifest", href: "/site.webmanifest", color: META.SITE_COLOR },
			{ rel: "icon", href: "/favicon.ico" },
			{ rel: "sitemap", href: "/sitemap.xml" },
		],
	}),
	shellComponent: RootDocument,
	notFoundComponent: () => <NotFound />,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
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
