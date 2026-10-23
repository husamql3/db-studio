import { createServerFn } from "@tanstack/react-start";
import { readSponsors } from "@/lib/sponsors-store";

export const getSponsors = createServerFn().handler(() => readSponsors());
