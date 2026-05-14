import { describe, expect, test } from "@jest/globals";
import { getMultipleCardData, RequestOptions } from "./scryfall";
import { EXAMPLE_MULTI_CARD_RESPONSE } from "../jest/fixtures/scryfall-data";

describe("Scryfall", () => {
    describe("#getMultipleCardData()", () => {
        test("for a single card", async () => {
            function httpReq<ScryfallResponse>(
                _options: RequestOptions
            ): Promise<ScryfallResponse> {
                return Promise.resolve(
                    EXAMPLE_MULTI_CARD_RESPONSE as unknown as ScryfallResponse
                );
            }
            const data = await getMultipleCardData(
				[
					{ name: "Delver of Secrets" },
					{ name: "Ledger Shredder" },
					{ name: "Dark Ritual" },
				],
                httpReq
            );
            expect(data).toEqual(EXAMPLE_MULTI_CARD_RESPONSE);
        });
    });
});