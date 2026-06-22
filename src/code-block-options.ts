import { ObsidianPluginMtgSettings } from "./settings";

export interface CodeBlockOptions {
    format: string | null;
    showOverrides: string[];
}

export const parseCodeBlockOptions = (infoString: string): CodeBlockOptions => {
    const stripped = infoString
        .replace(/^mtg-deck-?/, "")
        .trim();

    const showMatch = stripped.match(/show:([^\s]+)/);
    const showOverrides = showMatch
        ? showMatch[1].split(",").map(s => s.trim())
        : [];

    const format = stripped
        .replace(/show:[^\s]+/, "")
        .replace(/-$/, "")
        .trim() || null;

    return { format, showOverrides };
};

export const applyShowOverrides = (
    settings: ObsidianPluginMtgSettings,
    showOverrides: string[]
): ObsidianPluginMtgSettings => {
    if (showOverrides.length === 0) return settings;

    return {
        ...settings,
        decklist: {
            ...settings.decklist,
            showCardPrices: showOverrides.includes("prices") || settings.decklist.showCardPrices,
            showManaCosts: showOverrides.includes("manacosts") || settings.decklist.showManaCosts,
            showCardPreviews: showOverrides.includes("previews") || settings.decklist.showCardPreviews,
            showCardNamesAsHyperlinks: showOverrides.includes("hyperlinks") || settings.decklist.showCardNamesAsHyperlinks,
            showCardRarities: showOverrides.includes("rarities") || settings.decklist.showCardRarities,
            showBuylist: showOverrides.includes("buylist") || settings.decklist.showBuylist,
        },
    };
};