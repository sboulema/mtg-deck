export interface ObsidianPluginMtgSettings {
	collection: {
		// The path to the folder containing your collection CSV files
		folderPath: string;
		// The name of the column where card names are stored
		nameColumn: string;
		// The name of the column in your csv where your counts are stored
		countColumn: string;
	};
	decklist: {
		// Card Price Currency:
		preferredCurrency: "usd" | "eur" | "tix";
		// Show hyperlinks
		showCardNamesAsHyperlinks: boolean;
		// Show card previews
		showCardPreviews: boolean;
		// Show buylist
		showBuylist: boolean;
		// Show prices
		showCardPrices: boolean;
		// Show mana costs
		showManaCosts: boolean;
		// Show card rarities
		showCardRarities: boolean;
	};
}