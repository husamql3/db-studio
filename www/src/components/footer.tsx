import { META } from "shared/constants";
import { PlusIcon } from "lucide-react";

export const Footer = () => {
	return (
		<footer className="border-t">
			<div className="max-w-2xl mx-auto px-4 py-4 md:py-5 flex items-center justify-center relative border-x">
				<p className="text-xs font-light text-muted-foreground flex items-center gap-1">
					© 2025 {META.SITE_NAME}. Built by{" "}
					<a
						href={META.AUTHOR_GITHUB_LINK}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:underline flex items-start gap-1"
					>
						<img
							src={META.AUTHOR_AVATAR}
							alt={META.AUTHOR_NAME}
							width={16}
							height={16}
						/>
						{META.AUTHOR_NAME}
					</a>
				</p>

				<PlusIcon
					className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
					strokeWidth={1}
				/>
				<PlusIcon
					className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
					strokeWidth={1}
				/>
			</div>
		</footer>
	);
};
