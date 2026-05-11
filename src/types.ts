export const DEFAULT_SECTION_NAME = "Deck:";
export const COMMENT_DELIMITER = "#";
export const SKIP_SECTION_NAMES = ["About", "Name"];

export interface Line {
	lineType: "card" | "section" | "error" | "blank" | "comment";
	cardCount?: number;
	globalCount?: number | null;
	cardName?: string;
	cardSet?: string;
	cardNumber?: string;
	comments?: string[];
	errors?: string[];
	text?: string;
}
