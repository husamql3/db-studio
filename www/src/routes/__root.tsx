import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { NotFound } from "@/components/not-found";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ title: "DB Studio" },
			{ author: "Hüsam 🥑 <devhsmq@gmail.com>" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{
				name: "description",
				content:
					"DB Studio is a beautiful, modern database client for PostgreSQL and more. Spreadsheet-like grid, AI-powered SQL, ER diagrams, and coming soon to web, macOS, Windows & Linux. Join the waitlist!",
			},
			{ name: "robots", content: "index, follow" },
			// Open Graph for social sharing & AI previews
			{
				property: "og:title",
				content: "dbstudio.sh – A modern database management studiofor any database",
			},
			{
				property: "og:description",
				content:
					"A modern database management studio for any database that you can launch via the CLI. Spreadsheet-like grid, AI-powered SQL, ER diagrams, and coming soon to web, macOS, Windows & Linux. Join the waitlist!",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: "https://dbstudio.sh" },
			{ property: "og:site_name", content: "dbstudio.sh" },
			{ property: "og:image", content: "https://dbstudio.sh/og-image.png" },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content: "dbstudio.sh – Modern database management studio",
			},
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "manifest", href: "/site.webmanifest", color: "#1447e6" },
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
