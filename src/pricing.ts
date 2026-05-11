import { nameToId } from "./collection";
import { CardData } from "./scryfall";
import { ObsidianPluginMtgSettings } from "./settings";

export const currencyMapping: Record<string, string> = {
	usd: "$",
	eur: "€",
	tix: "Tx",
};

export const getCardPrice = (
	cardName: string,
	cardDataById: Record<string, CardData>,
	settings: ObsidianPluginMtgSettings
): string | null => {
	const cardId = nameToId(cardName);
	const cardData = cardDataById[cardId];
	const preferredCurrency = settings.decklist.preferredCurrency;
	const showCardPrices = settings.decklist.showCardPrices;

	if (!cardData || !showCardPrices) {
		return null;
	}

	if (preferredCurrency === "eur") {
		return cardData.prices?.eur || null;
	} else if (preferredCurrency === "tix") {
		return cardData.prices?.tix || null;
	} else {
		return cardData.prices?.usd || null;
	}
};
