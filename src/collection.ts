import { Vault } from "obsidian";
import { parseCsvFile } from "./csv";
import { ObsidianPluginMtgSettings } from "./settings";

export type CardCounts = Record<string, number>;

export const DEFAULT_COLLECTION_FILE_EXTENSION = "mtg.collection.csv";
export const DEFAULT_COLLECTION_NAME_COLUMN = "Name";
export const DEFAULT_COLLECTION_COUNT_COLUMN = "Count";
export const DEFAULT_COLLECTION_SYNC_INTERVAL = 5000;
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
): Promise<string[]> => {
    return (
        (
            await Promise.all(
                vault
                    .getFiles()
                    .filter((f) => {
                        if (f.extension === "csv") {
                            return f.name.endsWith(
                                `${settings.collection.fileExtension}`
                            );
                        } else {
                            return false;
                        }
                    })
                    .map((file) => vault.cachedRead(file).catch(() => ""))
            )
        )
            // remove any unreadable files
            .filter((s) => s.length)
    );
};

export const syncCounts = async (
    vault: Vault,
    settings: ObsidianPluginMtgSettings
): Promise<CardCounts> => {
    // Sync collection
    const collectionContents: string[] = await processCollectionFiles(
        vault,
        settings
    );

    // Create consolidated collection dictionary
    return createCardCountsMapping(collectionContents, settings);
};