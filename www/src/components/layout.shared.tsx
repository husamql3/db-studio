import { META } from "@db-studio/shared/constants";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { FaXTwitter } from "react-icons/fa6";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			enabled: true,
			// Fumadocs wraps the title in its own link to `url`, so the title must not be a link.
			title: (
				<span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
					<img
						src="/logo.png"
						alt=""
						width={24}
						height={24}
					/>
					db-studio
				</span>
			),
			url: "/",
		},
		themeSwitch: {
			enabled: false,
		},
		links: [
			// {
			// 	type: "button",
			// 	text: "introduction",
			// 	url: "/docs",
			// 	external: false,
			// },
			// {
			// 	type: "button",
			// 	text: "getting started",
			// 	url: "/docs/getting-started",
			// 	external: false,
			// },
			// {
			// 	type: "button",
			// 	text: "migrate from prisma studio",
			// 	url: "/docs/migrate-from-prisma-drizzle",
			// 	external: false,
			// },
			// {
			// 	type: "button",
			// 	text: "faq",
			// 	url: "/docs/faq",
			// 	external: false,
			// },
			{
				type: "icon",
				icon: <FaXTwitter className="size-4" />,
				text: "X",
				url: META.SITE_X_LINK,
				external: true,
			},
		],
		githubUrl: META.SITE_GITHUB_LINK,
		searchToggle: {
			enabled: true,
		},
	};
}
