import { nameToId } from "./collection";
import { CardData } from "./scryfall";
import { Line } from "./types";

export type ValidationErrorType = "banned" | "not_legal" | "restricted" | "deck_size" | "sideboard_size" | "max_copies" | "commander_zone" | "color_identity";

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
    commandZone: boolean;
}

export const FORMATS: FormatDefinition[] = [
    { name: "standard",        minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "future",          minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "historic",        minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "timeless",        minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "gladiator",       minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1, commandZone: true  },
    { name: "pioneer",         minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "modern",          minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "legacy",          minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "pauper",          minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "vintage",         minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "penny",           minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "commander",       minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1, commandZone: true  },
    { name: "oathbreaker",     minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 1, commandZone: true  },
    { name: "standardbrawl",   minDeckSize: 60,                        maxCopies: 1, commandZone: true  },
    { name: "brawl",           minDeckSize: 60,                        maxCopies: 1, commandZone: true  },
    { name: "alchemy",         minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "paupercommander", minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1, commandZone: true  },
    { name: "duel",            minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1, commandZone: true  },
    { name: "oldschool",       minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "premodern",       minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
    { name: "predh",           minDeckSize: 100, maxDeckSize: 100,     maxCopies: 1, commandZone: true  },
    { name: "tlr",             minDeckSize: 60,  maxSideboardSize: 15, maxCopies: 4, commandZone: false },
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
    commanderLines: Line[],
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
        ...validateColorIdentity(lines, commanderLines, cardDataByCardId, format),
        ...validateCommanderInDeck(lines, commanderLines, format),
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

export const validateCommanderZone = (
    lines: Line[],
    cardDataByCardId: Record<string, CardData>,
    format: string
): ValidationResult => {
    const errors = [
        ...validateCommanderZoneSize(lines, format),
        ...validateCommanderZoneType(lines, cardDataByCardId, format),
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

const validateCommanderZoneSize = (
    commanderLines: Line[],
    format: string
): ValidationError[] => {
    const formatDef = FORMATS.find(f => f.name === format.toLowerCase());
    if (!formatDef?.commandZone) return [];

    const errors: ValidationError[] = [];
    const cardLines = commanderLines.filter(line => line.lineType === "card");

    if (cardLines.length === 0) {
        errors.push({
            type: "commander_zone",
            message: `No commander found in the Commander section`,
        });
        return errors;
    }

    if (cardLines.length > 1) {
        errors.push({
            type: "commander_zone",
            message: `Commander zone has ${cardLines.length} cards, expected 1`,
        });
    }

    return errors;
};

const validateCommanderZoneType = (
    commanderLines: Line[],
    cardDataByCardId: Record<string, CardData>,
    format: string
): ValidationError[] => {
    const formatDef = FORMATS.find(f => f.name === format.toLowerCase());

    if (!formatDef?.commandZone) {
        return [];
    }

    const errors: ValidationError[] = [];
    const cardLines = commanderLines.filter(line => line.lineType === "card");

    cardLines.forEach(line => {
        const cardId = nameToId(line.cardName!);
        const cardInfo = cardDataByCardId[cardId];

        if (!cardInfo?.type_line) {
            return;
        }

        const isValidCommander =
            (cardInfo.type_line.includes("Legendary") && (
                cardInfo.type_line.includes("Creature") ||
                cardInfo.type_line.includes("Vehicle") ||
                cardInfo.type_line.includes("Spacecraft")
            )) || cardInfo.type_line.includes("Planeswalker");

        if (!isValidCommander) {
            errors.push({
                type: "commander_zone",
                message: `${line.cardName} is not a valid commander`,
                cardName: line.cardName,
            });
        }
    });

    return errors;
};

const validateColorIdentity = (
    lines: Line[],
    commanderLines: Line[],
    cardDataByCardId: Record<string, CardData>,
    format: string
): ValidationError[] => {
    const formatDef = FORMATS.find(f => f.name === format.toLowerCase());
    if (!formatDef?.commandZone) return [];

    const commanderCardLines = commanderLines.filter(line => line.lineType === "card");
    if (commanderCardLines.length === 0) return [];

    // Get combined color identity of all commanders
    const commanderColorIdentity = new Set(
        commanderCardLines.flatMap(line => {
            const cardId = nameToId(line.cardName!);
            return cardDataByCardId[cardId]?.color_identity ?? [];
        })
    );

    return lines
        .filter(line => line.lineType === "card" && line.cardName)
        .flatMap(line => {
            const cardId = nameToId(line.cardName!);
            const cardInfo = cardDataByCardId[cardId];
            if (!cardInfo) return [];

            const invalidColors = (cardInfo.color_identity ?? [])
                .filter(color => !commanderColorIdentity.has(color));

            if (invalidColors.length > 0) {
                return [{
                    type: "color_identity" as ValidationErrorType,
                    message: `${line.cardName} has color identity [${invalidColors.join(", ")}] outside commander's color identity`,
                    cardName: line.cardName,
                }];
            }

            return [];
        });
};

/**
 * Validates that each card in the commander zone is also present in the main deck.
 * In commander formats, the commander must be listed in both the command zone
 * and the 99-card deck.
 * Only runs for formats with a command zone (e.g. Commander, EDH, Brawl).
 *
 * @param lines - The main deck lines to check against
 * @param commanderLines - The lines from the Commander section
 * @param format - The format to validate against
 * @returns A list of validation errors for commanders not found in the deck
 */
const validateCommanderInDeck = (
    lines: Line[],
    commanderLines: Line[],
    format: string
): ValidationError[] => {
    const formatDef = FORMATS.find(f => f.name === format.toLowerCase());

    if (!formatDef?.commandZone) {
        return [];
    }

    return commanderLines
        .filter(line => line.lineType === "card" && line.cardName)
        .flatMap(line => {
            const isInDeck = lines.some(
                deckLine => deckLine.lineType === "card" &&
                deckLine.cardName === line.cardName
            );

            if (!isInDeck) {
                return [{
                    type: "commander_zone" as ValidationErrorType,
                    message: `${line.cardName} is in the command zone but not in the deck`,
                    cardName: line.cardName,
                }];
            }

            return [];
        });
};