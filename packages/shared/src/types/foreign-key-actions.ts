import { z } from "zod";

export const FOREIGN_KEY_ACTIONS = [
	"CASCADE",
	"SET NULL",
	"SET DEFAULT",
	"RESTRICT",
	"NO ACTION",
] as const;
export const foreignKeyActionSchema = z.enum(FOREIGN_KEY_ACTIONS);
