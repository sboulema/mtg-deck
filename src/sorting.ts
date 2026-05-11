import { nameToId } from "./collection";
import { CardData } from "./scryfall";
import { Line } from "./types";

import creatureSvg from "./assets/card-types/creature.svg";
import planeswalkerSvg from "./assets/card-types/planeswalker.svg";
import sorcerySvg from "./assets/card-types/sorcery.svg";
import instantSvg from "./assets/card-types/instant.svg";
import artifactSvg from "./assets/card-types/artifact.svg";
import enchantmentSvg from "./assets/card-types/enchantment.svg";
import landSvg from "./assets/card-types/land.svg";

export const cardTypeOrder = [
	"Planeswalker",
	"Creature",
	"Sorcery",
	"Instant",
	"Artifact",
	"Enchantment",
	"Land",
];

export const cardTypeIcons: Record<string, string> = {
    "Planeswalker": planeswalkerSvg,
    "Creature":     creatureSvg,
    "Sorcery":      sorcerySvg,
    "Instant":      instantSvg,
    "Artifact":     artifactSvg,
    "Enchantment":  enchantmentSvg,
    "Land":         landSvg,
};

export const getTypeOrder = (
	line: Line,
	cardDataByCardId: Record<string, CardData>
): number => {
	if (line.lineType !== "card" || !line.cardName) {
		return 999;
	}

	const cardId = nameToId(line.cardName);
	const cardInfo = cardDataByCardId[cardId];

	if (!cardInfo?.type_line) {
		return 999;
	}

	const index = cardTypeOrder.findIndex((type) =>
		cardInfo.type_line!.includes(type)
	);

	return index === -1 ? 999 : index;
};

export const getTypeCounts = (
    lines: Line[],
    cardDataByCardId: Record<string, CardData>
): Record<string, number> => {
    return lines
        .filter(line => line.lineType === "card" && line.cardName)
        .reduce((acc, line) => {
            const typeOrder = getTypeOrder(line, cardDataByCardId);
            const typeName = cardTypeOrder[typeOrder] ?? "Other";
            acc[typeName] = (acc[typeName] ?? 0) + (line.cardCount ?? 0);
            return acc;
        }, {} as Record<string, number>);
};

export const sortLines = (
	lines: Line[],
	cardDataByCardId: Record<string, CardData>
): Line[] => {
	return [...lines].sort((a, b) => {
		const typeOrder =
			getTypeOrder(a, cardDataByCardId) - getTypeOrder(b, cardDataByCardId);

		if (typeOrder !== 0) {
			return typeOrder;
		}

		return (a.cardName ?? "").localeCompare(b.cardName ?? "");
	});
};
