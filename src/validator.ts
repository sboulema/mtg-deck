import { nameToId } from "./collection";
import { CardData } from "./scryfall";
import { Line } from "./types";

export type ValidationErrorType = "banned" | "not_legal" | "restricted";

export interface ValidationError {
    type: ValidationErrorType;
    message: string;
    cardName: string;
}

export interface ValidationResult {
    format: string;
    errors: ValidationError[];
}

const getLegalityErrors = (
    cardName: string,
    cardCount: number,
    cardInfo: CardData,
    format: string
): ValidationError[] => {
    const legality = cardInfo.legalities?.[format.toLowerCase()];
    const errors: ValidationError[] = [];

    if (legality === "banned") {
        errors.push({
            type: "banned",
            message: `${cardName} is banned in ${format}`,
            cardName,
        });
    } else if (legality === "not_legal") {
        errors.push({
            type: "not_legal",
            message: `${cardName} is not legal in ${format}`,
            cardName,
        });
    } else if (legality === "restricted" && cardCount > 1) {
        errors.push({
            type: "restricted",
            message: `${cardName} is restricted to 1 copy in ${format}`,
            cardName,
        });
    }

    return errors;
};

export const validateDecklist = (
    lines: Line[],
    cardDataByCardId: Record<string, CardData>,
    format: string
): ValidationResult => {
    const errors = lines
        .filter(line => line.lineType === "card" && line.cardName)
        .flatMap(line => {
            const cardId = nameToId(line.cardName!);
            const cardInfo = cardDataByCardId[cardId];

            if (!cardInfo) {
                return [];
            }

            return getLegalityErrors(
                line.cardName!,
                line.cardCount ?? 0,
                cardInfo,
                format
            );
        });

    return { format, errors };
};