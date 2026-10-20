export const SPONSOR_EMAIL = "dbstudio@ql3.dev";

export type SponsorTierId = "mythic" | "legendary" | "sponsor" | "platform";

/** One sponsor as stored in the SPONSORS KV namespace and edited at /admin. */
export type Sponsor = {
	id: string;
	name: string;
	url: string;
	tier: SponsorTierId;
	/** Upload time of the logo, when there is one; it versions the logo URL. */
	logo?: number;
};

export type SponsorTier = {
	id: SponsorTierId;
	name: string;
	label: string;
	price: string;
	/** Slots on the homepage, filled or open. */
	spots: number;
};

/** Highest tier first; the homepage gives higher tiers larger cells. */
export const sponsorTiers: SponsorTier[] = [
	{ id: "mythic", name: "Mythic", label: "Mythic sponsors", price: "$150/mo", spots: 1 },
	{
		id: "legendary",
		name: "Legendary",
		label: "Legendary sponsors",
		price: "$75/mo",
		spots: 2,
	},
	{ id: "sponsor", name: "Sponsor", label: "Sponsors", price: "$100 for 12 months", spots: 3 },
	{ id: "platform", name: "Platform", label: "Platform sponsors", price: "In kind", spots: 2 },
];

export const sponsorLogoUrl = ({ id, logo }: Sponsor) => `/api/sponsors/logo/${id}?v=${logo}`;

export const sponsorMailto = (tier: SponsorTier) =>
	`mailto:${SPONSOR_EMAIL}?subject=${encodeURIComponent(`db-studio ${tier.name} sponsorship`)}`;
