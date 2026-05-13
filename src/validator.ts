import { nameToId } from "./collection";
import { CardData } from "./scryfall";
import { Line } from "./types";

export type ValidationErrorType = "banned" | "not_legal" | "restricted" | "deck_size" | "sideboard_size" | "max_copies";

export interface ValidationError {
    type: ValidationErrorType;
    message: string;
    cardName?: string;
}

export interface ValidationResult {
    format: string;
    errors: ValidationError[];
}

export interface FormatDefinition {
    name: string;
    minDeckSize: number;
    maxDeckSize?: number;
    maxSideboardSize?: number;
    maxCopies: number;
}

export const FORMATS: FormatDefinition[] = [
    { name: "standard",        minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "future",          minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "historic",        minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "timeless",        minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "gladiator",       minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1 },
    { name: "pioneer",         minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "modern",          minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "legacy",          minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "pauper",          minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "vintage",         minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "penny",           minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "commander",       minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1 },
    { name: "oathbreaker",     minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 1 },
    { name: "standardbrawl",   minDeckSize: 60,                        maxCopies: 1 },
    { name: "brawl",           minDeckSize: 60,                        maxCopies: 1 },
    { name: "alchemy",         minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "paupercommander", minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1 },
    { name: "duel",            minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1 },
    { name: "oldschool",       minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "premodern",       minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
    { name: "predh",           minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1 },
    { name: "tlr",             minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4 },
];

const validateDeckSize = (lines: Line[], format: string): ValidationError[] => {
    const formatDef = FORMATS.find(f => f.name === format.toLowerCase());
    if (!formatDef) return [];

    const deckSize = lines
        .filter(line => line.lineType === "card")
        .reduce((acc, line) => acc + (line.cardCount ?? 0), 0);

    const errors: ValidationError[] = [];

    if (deckSize < formatDef.minDeckSize) {
        errors.push({
            type: "deck_size",
            message: `Deck has ${deckSize} cards, minimum is ${formatDef.minDeckSize} for ${format}`,
            cardName: "",
        });
    }

    if (formatDef.maxDeckSize && deckSize > formatDef.maxDeckSize) {
        errors.push({
            type: "deck_size",
            message: `Deck has ${deckSize} cards, maximum is ${formatDef.maxDeckSize} for ${format}`,
            cardName: "",
        });
    }

    return errors;
};

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
    const errors = [
        ...lines
            .filter(line => line.lineType === "card" && line.cardName)
            .flatMap(line => {
                const cardId = nameToId(line.cardName);
                const cardInfo = cardDataByCardId[cardId];
                if (!cardInfo) return [];
                return getLegalityErrors(line.cardName!, line.cardCount ?? 0, cardInfo, format);
            }),
        ...validateDeckSize(lines, format),
        ...validateMaxCopies(lines, cardDataByCardId, format),
    ];

    return { format, errors };
};

export const validateSideboard = (
    lines: Line[],
    cardDataByCardId: Record<string, CardData>,
    format: string
): ValidationResult => {
    const errors = [
        ...validateSideboardSize(lines, format),
        ...validateMaxCopies(lines, cardDataByCardId, format),
    ];

    return { format, errors };
};

export const validateSideboardSize = (
    lines: Line[],
    format: string
): ValidationError[] => {
    const formatDef = FORMATS.find(f => f.name === format.toLowerCase());
    if (!formatDef?.maxSideboardSize) return [];

    const sideboardSize = lines
        .filter(line => line.lineType === "card")
        .reduce((acc, line) => acc + (line.cardCount ?? 0), 0);

    if (sideboardSize > formatDef.maxSideboardSize) {
        return [{
            type: "sideboard_size",
            message: `Sideboard has ${sideboardSize} cards, maximum is ${formatDef.maxSideboardSize} for ${format}`,
            cardName: "",
        }];
    }

    return [];
};

const isBasicLand = (cardInfo: CardData): boolean =>
    cardInfo?.type_line?.includes("Basic Land") ?? false;

const isUnlimitedCopies = (cardInfo: CardData): boolean => {
    const oracleText = cardInfo?.oracle_text
        ?? cardInfo?.card_faces?.[0]?.oracle_text
        ?? "";
    return oracleText.includes("A deck can have any number of cards named");
};

const validateMaxCopies = (
    lines: Line[],
    cardDataByCardId: Record<string, CardData>,
    format: string
): ValidationError[] => {
    const formatDef = FORMATS.find(f => f.name === format.toLowerCase());
    if (!formatDef) return [];

    const cardCounts: Record<string, number> = {};

    return lines
        .filter(line => line.lineType === "card" && line.cardName)
        .flatMap(line => {
            const cardId = nameToId(line.cardName);
            const cardInfo = cardDataByCardId[cardId];

            if (!cardInfo || isBasicLand(cardInfo) || isUnlimitedCopies(cardInfo)) {
                return [];
            }

            cardCounts[cardId] = (cardCounts[cardId] ?? 0) + (line.cardCount ?? 0);

            if (cardCounts[cardId] > formatDef.maxCopies) {
                return [{
                    type: "max_copies" as ValidationErrorType,
                    message: `${line.cardName} has ${cardCounts[cardId]} copies, maximum is ${formatDef.maxCopies} for ${format}`,
                    cardName: line.cardName,
                }];
            }

            return [];
        });
};