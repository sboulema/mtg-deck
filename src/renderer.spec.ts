import { describe, expect, test } from "@jest/globals";
import { renderDecklist } from "./renderer";
import { ObsidianPluginMtgSettings } from "./settings";
import { EXAMPLE_DECKLIST_CARD_DATA } from "../jest/fixtures/scryfall-data";
import { CardIdentifier, CardData } from "./scryfall";
import {
    EXAMPLE_COLLECTION,
    EXAMPLE_DECK_1
} from "../jest/fixtures/content";

const fakeFetcher = (
    _distinctCards: CardIdentifier[]
): Promise<Record<string, CardData>> =>
    Promise.resolve(EXAMPLE_DECKLIST_CARD_DATA as Record<string, CardData>);

describe("Renderer", () => {
    const settings: ObsidianPluginMtgSettings = {
        collection: {
            folderPath: "Collections",
            nameColumn: "Name",
            countColumn: "Count",
        },
        decklist: {
            preferredCurrency: "usd",
            showCardNamesAsHyperlinks: true,
            showCardPreviews: true,
            showBuylist: true,
            showCardPrices: true,
            showManaCosts: true,
            showCardRarities: true,
        },
    };

    describe("#renderDecklist", () => {
        test("with prices", async () => {
            const el = await renderDecklist(
                document.body,
                EXAMPLE_DECK_1,
                EXAMPLE_COLLECTION,
                settings,
                null,
                fakeFetcher
            );
            expect(el.innerHTML.trim()).toMatchSnapshot();
        });
        test("without prices", async () => {
            const el = await renderDecklist(
                document.body,
                EXAMPLE_DECK_1,
                EXAMPLE_COLLECTION,
                {
                    ...settings,
                    decklist: {
                        ...settings.decklist,
                        showCardPrices: false,
                    },
                },
                null,
                fakeFetcher
            );
            expect(el.innerHTML.trim()).toMatchSnapshot();
        });
    });
});