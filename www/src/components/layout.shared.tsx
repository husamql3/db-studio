import { Link } from "@tanstack/react-router";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { FaXTwitter } from "react-icons/fa6";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			enabled: true,
			title: (
				<Link to="/">
					<img
						src="/logo.png"
						alt="DB Studio"
						width={32}
					/>
				</Link>
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
				url: "https://x.com/dbstudio_sh",
				external: true,
			},
		],
		githubUrl: "https://github.com/husamql3/db-studio",
		searchToggle: {
			enabled: true,
		},
	};
}
