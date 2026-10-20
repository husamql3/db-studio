import { createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { sponsorLogoUrl, sponsorTiers } from "@/lib/content/sponsors";
import { cn } from "@/lib/utils";
import { getSponsors } from "@/utils/get-sponsors";

export const Route = createFileRoute("/admin/")({
	component: Admin,
	validateSearch: (search): { error?: string } =>
		typeof search.error === "string" ? { error: search.error } : {},
	loader: () => getSponsors(),
	head: () => ({
		meta: [{ title: "Sponsors · db-studio admin" }, { name: "robots", content: "noindex" }],
	}),
});

const FIELD =
	"h-8 w-full border bg-background px-2 text-sm outline-none focus:border-foreground/40";

function Admin() {
	const sponsors = Route.useLoaderData();
	const { error } = Route.useSearch();

	return (
		<main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-lg tracking-tight">Sponsors</h1>
				<form
					method="post"
					action="/admin/logout"
				>
					<button
						type="submit"
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						Log out
					</button>
				</form>
			</div>

			{sponsorTiers.map((tier) => {
				const inTier = sponsors.filter((s) => s.tier === tier.id);
				return (
					<section
						key={tier.id}
						className="border"
					>
						<h2 className="flex justify-between border-b px-4 py-2 text-xs">
							<span className="font-semibold">{tier.label}</span>
							<span className="text-muted-foreground">
								{inTier.length} of {tier.spots} spots
							</span>
						</h2>
						{inTier.length === 0 && (
							<p className="px-4 py-3 text-muted-foreground text-xs">No sponsors yet.</p>
						)}
						{inTier.map((sponsor) => (
							<div
								key={sponsor.id}
								className="flex items-center gap-3 border-b px-4 py-2 last:border-b-0"
							>
								{sponsor.logo ? (
									<img
										src={sponsorLogoUrl(sponsor)}
										alt=""
										className="h-6 w-16 object-contain"
									/>
								) : (
									<span className="w-16 text-muted-foreground text-xs">No logo</span>
								)}
								<div className="min-w-0 flex-1">
									<p className="text-sm">{sponsor.name}</p>
									<p className="truncate text-muted-foreground text-xs">{sponsor.url}</p>
								</div>
								<form
									method="post"
									action="/admin/sponsors"
								>
									<input
										type="hidden"
										name="action"
										value="remove"
									/>
									<input
										type="hidden"
										name="id"
										value={sponsor.id}
									/>
									<button
										type="submit"
										className={buttonVariants({ variant: "outline", size: "sm" })}
									>
										Remove
									</button>
								</form>
							</div>
						))}
					</section>
				);
			})}

			<form
				method="post"
				action="/admin/sponsors"
				encType="multipart/form-data"
				className="flex flex-col gap-3 border p-4"
			>
				<h2 className="font-semibold text-sm">Add a sponsor</h2>
				{error && <p className="text-red-400 text-xs">{error}</p>}
				<label className="flex flex-col gap-1 text-xs">
					Name
					<input
						name="name"
						required
						className={FIELD}
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs">
					Link
					<input
						name="url"
						type="url"
						required
						placeholder="https://"
						className={FIELD}
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs">
					Tier
					<select
						name="tier"
						className={FIELD}
					>
						{sponsorTiers.map((tier) => (
							<option
								key={tier.id}
								value={tier.id}
							>
								{tier.name} ({tier.price})
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1 text-xs">
					Logo (optional; SVG, PNG, JPEG or WebP under 512 KB, light on dark)
					<input
						name="logo"
						type="file"
						accept="image/svg+xml,image/png,image/jpeg,image/webp"
						className={cn(FIELD, "py-1 file:mr-2 file:border-0 file:bg-transparent")}
					/>
				</label>
				<button
					type="submit"
					className={cn(buttonVariants({ variant: "primary", size: "sm" }), "self-start")}
				>
					Add sponsor
				</button>
			</form>
		</main>
	);
}
