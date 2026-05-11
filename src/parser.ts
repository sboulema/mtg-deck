import { CardCounts, nameToId } from "./collection";
import { CardIdentifier } from "./scryfall";
import { COMMENT_DELIMITER, Line } from "./types";

const lineMatchRE = /^(\d+)\s+(.*?)(\s+\(([A-Za-z0-9]{3})\)\s+0*(\d+))?$/;
const blankLineRE = /^\s+$/;
const headingMatchRE = new RegExp("^[^[0-9|" + COMMENT_DELIMITER + "]");

export const parseLines = (
	rawLines: string[],
	cardCounts: CardCounts
): Line[] => {
	// This means global counts are not available because they are missing or no collection files are present
	const shouldSkipGlobalCounts = !Object.keys(cardCounts).length;

	return rawLines.map((line) => {
		// Handle blank lines
		if (!line.length || line.match(blankLineRE)) {
			return { lineType: "blank" };
		}

		// Handle headings
		if (line.match(headingMatchRE)) {
			return { lineType: "section", text: line };
		}

		// Handle comment lines
		if (line.startsWith(COMMENT_DELIMITER + " ")) {
			return { lineType: "comment", comments: [line] };
		}

		let lineWithoutComments: string = line;
		const comments: string[] = [];

		// Handle inline comments
		if (line.includes(COMMENT_DELIMITER)) {
			const lineAndComments = line.split(COMMENT_DELIMITER);
			lineAndComments.slice(1).forEach((comment) => comments.push(comment));
			lineWithoutComments = lineAndComments[0];
		}

		const lineParts = lineWithoutComments.match(lineMatchRE);

		if (lineParts == null) {
			return { lineType: "error", errors: [`invalid line: ${line}`] };
		}

		const cardCount: number = parseInt(lineParts[1] || "0");
		const cardName: string = lineParts[2];
		const cardId: string = nameToId(cardName);
		const cardSet: string = lineParts[4];
		const cardNumber: string = lineParts[5];
		const errors: string[] = [];

		let globalCount = null;

		if (!shouldSkipGlobalCounts) {
			globalCount = cardCounts[cardId] || 0;
		}

		if (cardName.length === 0) {
			errors.push(`Unable to parse card name from: ${line}`);
		}

		return {
			lineType: "card",
			cardCount,
			globalCount,
			cardName,
			cardSet,
			cardNumber,
			comments,
			errors,
		};
	});
};

export const buildDistinctCardList = (lines: Line[]): CardIdentifier[] => {
	return Array.from(
		new Set(
			lines.flatMap((line): CardIdentifier[] => {
				if (line.lineType !== "card") {
					return [];
				} else if (line.cardSet === undefined) {
					return [{ name: nameToId(line.cardName) }];
				} else if (line.cardNumber !== undefined) {
					return [{ set: line.cardSet, collector_number: line.cardNumber }];
				} else {
					return [];
				}
			})
		)
	);
};
