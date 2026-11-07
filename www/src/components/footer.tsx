import { META } from "@db-studio/shared/constants";
import { Link } from "@tanstack/react-router";

const LINK = "transition-colors duration-150 hover:text-foreground";

export const Footer = () => {
	return (
		<footer className="border-t">
			<div className="mx-auto flex max-w-5xl flex-col gap-4 border-x px-5 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
				<p className="flex items-center gap-1.5">
					© 2026 {META.SITE_NAME}. Built by
					<a
						href={META.AUTHOR_GITHUB_LINK}
						target="_blank"
						rel="noopener noreferrer"
						className={`flex items-center gap-1 text-foreground ${LINK}`}
					>
						<img
							src={META.AUTHOR_AVATAR}
							alt=""
							width={14}
							height={14}
						/>
						{META.AUTHOR_NAME}
					</a>
				</p>

				<nav className="flex flex-wrap gap-x-5 gap-y-2">
					<Link
						to="/docs/$"
						className={LINK}
					>
						Docs
					</Link>
					<Link
						to="/changelog"
						className={LINK}
					>
						Changelog
					</Link>
					<Link
						to="/roadmap"
						className={LINK}
					>
						Roadmap
					</Link>
					<a
						href={META.SITE_GITHUB_LINK}
						target="_blank"
						rel="noopener noreferrer"
						className={LINK}
					>
						GitHub
					</a>
					<a
						href="https://www.npmjs.com/package/db-studio"
						target="_blank"
						rel="noopener noreferrer"
						className={LINK}
					>
						npm
					</a>
				</nav>
			</div>
		</footer>
	);
};
