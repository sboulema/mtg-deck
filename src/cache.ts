import { CardData } from "./scryfall";

export interface CachedCardData {
    data: CardData;
}

let cardDataCache: Record<string, CachedCardData> = {};

export const loadCache = (data: Record<string, CachedCardData>): void => {
    cardDataCache = data;
};

export const getCache = (): Record<string, CachedCardData> => {
    return cardDataCache;
};

export const clearCache = (): void => {
    cardDataCache = {};
};

export const getCachedCardData = (): Record<string, CardData> => {
    return Object.fromEntries(
        Object.entries(cardDataCache)
            .map(([key, entry]) => [key, entry.data])
    );
};

export const setCachedCardData = (key: string, data: CardData): void => {
    cardDataCache[key] = { data };
};

export const hasCachedCardData = (key: string): boolean => {
    return !!cardDataCache[key];
};