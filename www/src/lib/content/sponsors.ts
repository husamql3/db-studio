export const SPONSOR_EMAIL = "dbstudio@ql3.dev";

type Sponsor = {
	name: string;
	url: string;
};

export type SponsorTierId = "mythic" | "legendary" | "sponsor" | "platform";

export type SponsorTier = {
	id: SponsorTierId;
	name: string;
	label: string;
	price: string;
	/** Slots on the homepage, filled or open. */
	spots: number;
	sponsors: Sponsor[];
};

/** Highest tier first; the homepage gives higher tiers larger cells. */
export const sponsorTiers: SponsorTier[] = [
	{
		id: "mythic",
		name: "Mythic",
		label: "Mythic sponsors",
		price: "$150/mo",
		spots: 1,
		sponsors: [],
	},
	{
		id: "legendary",
		name: "Legendary",
		label: "Legendary sponsors",
		price: "$75/mo",
		spots: 2,
		sponsors: [],
	},
	{
		id: "sponsor",
		name: "Sponsor",
		label: "Sponsors",
		price: "$100 for 12 months",
		spots: 3,
		sponsors: [],
	},
	{
		id: "platform",
		name: "Platform",
		label: "Platform sponsors",
		price: "In kind",
		spots: 2,
		sponsors: [],
	},
];

export const sponsorMailto = (tier: SponsorTier) =>
	`mailto:${SPONSOR_EMAIL}?subject=${encodeURIComponent(`db-studio ${tier.name} sponsorship`)}`;
