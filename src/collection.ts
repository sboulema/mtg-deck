import { Vault } from "obsidian";
import { parseCsvFile } from "./csv";
import { ObsidianPluginMtgSettings } from "./settings";

export type CardCounts = Record<string, number>;

export interface CardCollection {
    fileName: string;
    counts: CardCounts;
}

export type CollectionData = CardCollection[];

export const DEFAULT_COLLECTION_FOLDER_PATH = "Collections";
export const DEFAULT_COLLECTION_NAME_COLUMN = "Name";
export const DEFAULT_COLLECTION_COUNT_COLUMN = "Count";
export const UNKNOWN_CARD = "UNKNOWN_CARD";

export const nameToId = (rawName: string | undefined) => {
    return (
        (rawName || "")
            // handle double-faced cards (i.e. "Delver Of Secrets" and "Delver of Secrets // Insectile Aberration")
            .split("//")[0]
            // remove surrounding whitespace
            .trim()
            // normalizing casing
            .toLowerCase()
    );
};

export const createCardCountsMapping = (
    fileContents: string[],
    settings: ObsidianPluginMtgSettings
): CardCounts => {
    const counts: CardCounts = {};
    const countsColumnName: string = settings.collection.countColumn;
    const nameColumnName: string = settings.collection.nameColumn;

    const recordsList: Record<string, string>[][] = fileContents.map(
        (fileContent) => {
            const records = parseCsvFile(fileContent);
            return records;
        }
    );

    recordsList.forEach((records) => {
        records.forEach((record) => {
            const count: number = parseInt(record[countsColumnName] || "0");
            const cardName: string =
                nameToId(record[nameColumnName]) || UNKNOWN_CARD;
            if (!counts[cardName]) {
                counts[cardName] = count;
            } else {
                counts[cardName] = counts[cardName] + count;
            }
        });
    });

    return counts;
};

export const processCollectionFiles = async (
    vault: Vault,
    settings: ObsidianPluginMtgSettings
): Promise<CardCollection[]> => {
    const folderPath = settings.collection.folderPath;

    if (!folderPath) {
        return [];
    }

    const files = vault.getFiles().filter(
        file => file.extension === "csv" &&
        file.parent?.path.startsWith(folderPath)
    );

    if (files.length === 0) {
        return [];
    }

    return (await Promise.all(
        files.map(async file => {
            const content = await vault.cachedRead(file).catch(() => "");
            if (!content.length) return null;
            return {
                fileName: file.basename,
                counts: createCardCountsMapping([content], settings),
            };
        })
    )).filter((c): c is CardCollection => c !== null);
};

export const syncCollections = async (
    vault: Vault,
    settings: ObsidianPluginMtgSettings
): Promise<CardCollection[]> => {
    return processCollectionFiles(vault, settings);
};

export const hashCollectionContents = (contents: CardCollection[]): string => {
    const combined = contents.map(c => Object.entries(c.counts).join("")).join("");
    return `${contents.length}-${combined.length}`;
};

export const mergeCollections = (collections: CardCollection[]): CardCounts => {
    return collections.reduce((acc, collection) => {
        Object.entries(collection.counts).forEach(([name, count]) => {
            acc[name] = (acc[name] ?? 0) + count;
        });
        return acc;
    }, {} as CardCounts);
};