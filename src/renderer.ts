import { CardCounts, nameToId, UNKNOWN_CARD } from "./collection";
import {
	CardData,
	getMultipleCardData,
	MAX_SCRYFALL_BATCH_SIZE,
	ScryfallResponse,
} from "./scryfall";
import { ObsidianPluginMtgSettings } from "./settings";

const DEFAULT_SECTION_NAME = "Deck:";
const COMMENT_DELIMITER = "#";

interface Line {
	lineType: "card" | "section" | "error" | "blank" | "comment";
	cardCount?: number;
	globalCount?: number | null;
	cardName?: string;
	comments?: string[];
	errors?: string[];
	text?: string;
}

const lineMatchRE = /(\d+)\s(.*)/;
const setCodesRE = /(\([A-Za-z0-9]{3}\)\s\d+)/;
const lineWithSetCodes = /(\d+)\s+([\w| ,']*)\s+(\([A-Za-z0-9]{3}\)\s\d+)/;
const blankLineRE = /^\s+$/;
const headingMatchRE = new RegExp("^[^[0-9|" + COMMENT_DELIMITER + "]");

const currencyMapping = {
	usd: "$",
	eur: "€",
	tix: "Tx",
};

export const getCardPrice = (
	cardName: string,
	cardDataById: Record<string, CardData>,
	settings: ObsidianPluginMtgSettings
) => {
	const cardId = nameToId(cardName);
	const cardData = cardDataById[cardId];
	const preferredCurrency = settings.decklist.preferredCurrency;
	const hidePrices = settings.decklist.hidePrices;
	if (!cardData || hidePrices) {
		return null;
	} else {
		if (preferredCurrency === "eur") {
			return cardData.prices?.eur || null;
		} else if (preferredCurrency === "tix") {
			return cardData.prices?.tix || null;
		} else {
			return cardData.prices?.usd || null;
		}
	}
};

export const parseLines = (
	rawLines: string[],
	cardCounts: CardCounts
): Line[] => {
	// This means global counts are not available because they are missing or no collection files are present
	const shouldSkipGlobalCounts = !Object.keys(cardCounts).length;

	// count, collection_count, card name, comment
	return rawLines.map((line) => {
		// Handle blank lines
		if (!line.length || line.match(blankLineRE)) {
			return {
				lineType: "blank",
			};
		}

		// Handle headings
		if (line.match(headingMatchRE)) {
			return {
				lineType: "section",
				text: line,
			};
		}

		// Handle comment lines
		if (line.startsWith(COMMENT_DELIMITER + " ")) {
			return {
				lineType: "comment",
				comments: [line],
			};
		}

		let lineWithoutComments: string = line;
		const comments: string[] = [];
		// Handle setcodes, etc
		if (lineWithoutComments.match(lineWithSetCodes)) {
			lineWithoutComments = lineWithoutComments
				.replace(setCodesRE, "")
				.trim();
		}

		// Handle comments
		if (line.includes(COMMENT_DELIMITER)) {
			const lineAndComments = line.split(COMMENT_DELIMITER);
			lineAndComments
				.slice(1)
				.forEach((comment) => comments.push(comment));
			lineWithoutComments = lineAndComments[0];
		}

		// Handle card lines
		const lineParts = lineWithoutComments.match(lineMatchRE);

		// Handle invalid line
		if (lineParts == null) {
			return {
				lineType: "error",
				errors: [`invalid line: ${line}`],
			};
		} else {
			const cardCount: number = parseInt(lineParts[1] || "0");
			const cardName: string = lineParts[2];
			const cardId: string = nameToId(cardName);
			const errors: string[] = [];

			let globalCount = null;

			if (!shouldSkipGlobalCounts) {
				globalCount = cardCounts[cardId] || 0;
			}

			if (cardName.length === 0) {
				errors.push(`Unable to parse card name from: ${line}`);
			}

			return {
				lineType: "card",
				cardCount,
				globalCount,
				cardName,
				comments,
				errors,
			};
		}
	});
};

export const buildDistinctCardNamesList = (lines: Line[]): string[] => {
	return Array.from(
		new Set(
			lines
				.map((line) => line.cardName || "")
				// Remove missing values
				.filter((line) => line !== "")
		)
	);
};

export const fetchCardDataFromScryfall = async (
	distinctCardNames: string[]
): Promise<Record<string, CardData>> => {
	// Fetch in batches of 75, since that's the limit of Scryfall batch sizes
	const batches: string[][] = [];
	let currentBatch: string[] = [];
	batches.push(currentBatch);
	distinctCardNames.forEach((cardName: string) => {
		if (currentBatch.length === MAX_SCRYFALL_BATCH_SIZE) {
			batches.push(currentBatch);
			// Make new batch
			currentBatch = [];
		}
		currentBatch.push(nameToId(cardName));
	});
	// Add remaining cards
	batches.push(currentBatch);

	const cardDataInBatches: ScryfallResponse[] = await Promise.all(
		batches.map((batch) => getMultipleCardData(batch))
	);
	const cardDataByCardId: Record<string, CardData> = {};
	const cards: CardData[] = [];

	cardDataInBatches.forEach((batch) => {
		batch.data.forEach((card: CardData) => {
			cards.push(card);
			if (card.name) {
				const cardId = nameToId(card.name);
				cardDataByCardId[cardId] = card;
			}
		});
	});

	return cardDataByCardId;
};

export const renderDecklist = async (
	root: Element,
	source: string,
	cardCounts: CardCounts,
	settings: ObsidianPluginMtgSettings,
	dataFetcher = fetchCardDataFromScryfall
): Promise<Element> => {
	const containerEl = root.createDiv({ cls: "decklist" });

	const lines: string[] = source.split("\n");

	const parsedLines: Line[] = parseLines(lines, cardCounts);

	const linesBySection: Record<string, Line[]> = {};

	let currentSection = DEFAULT_SECTION_NAME;
	const sections: string[] = [];

	parsedLines.forEach((line, idx) => {
		if (idx == 0 && line.lineType !== "section") {
			currentSection = `${currentSection}`;
			sections.push(`${currentSection}`);
		}
		if (line.lineType === "section") {
			currentSection = line.text || DEFAULT_SECTION_NAME;
			sections.push(`${currentSection}`);
		} else {
			if (!linesBySection[currentSection]) {
				linesBySection[currentSection] = [];
			}
			linesBySection[currentSection].push(line);
		}
	});

	// Create list of distinct card names
	const distinctCardNames: string[] = buildDistinctCardNamesList(parsedLines);
	let cardDataByCardId: Record<string, CardData> = {};

	// Try to fetch data from Scryfall
	try {
		cardDataByCardId = await dataFetcher(distinctCardNames);
	} catch (err) {
		console.error("Error fetching card data: ", err);
	}

	// Determines whether any card info was found for the cards on the list
	const hasCardInfo = Object.keys(cardDataByCardId).length > 0;

	// Make elements from parsedLines
	const sectionContainers: Element[] = [];

	// Header section
	const header = containerEl.createDiv({ cls: "header" });
	const imgElContainer = header.createDiv({ cls: "card-image-container" });
	const imgEl = imgElContainer.createEl("img", { cls: "card-image" });

	// Footer section
	const footer = containerEl.createDiv({ cls: "footer" });

	const sectionTotalCounts: Record<string, number> = sections.reduce(
		(acc, curr) => ({ ...acc, [curr]: 0 }),
		{}
	);
	const sectionTotalCost: Record<string, number> = sections.reduce(
		(acc, curr) => ({ ...acc, [curr]: 0.0 }),
		{}
	);
	const missingCardCounts: CardCounts = {};

	sections.forEach((section: string) => {
		// Put the entire deck in containing div for styling
		const sectionContainer = containerEl.createDiv({ cls: "decklist__section-container" });

		// Create a heading
		const sectionHeadingEl = sectionContainer.createEl("h3", { cls: "decklist__section-heading" });

		// Create container for the table rows
		const sectionList = sectionContainer.createEl("table");
		const sectionListHead = sectionList.createEl("thead");
		const sectionListHeadRow = sectionListHead.createEl("tr");
		sectionListHeadRow.createEl("th", { text: "Count" });
		sectionListHeadRow.createEl("th", { text: "Name" });
		if (!settings.decklist.hidePrices) {
			sectionListHeadRow.createEl("th", { text: "Price" });
		}
		const sectionListBody = sectionList.createEl("tbody");

		const sectionMissingCardCounts: CardCounts = {};

		// Create line item elements
		linesBySection[section].forEach((line: Line) => {
			const lineEl = sectionListBody.createEl("tr");

			if (line.lineType === "card") {
				const cardCountCell = lineEl.createEl("td");
				const cardCountEl = cardCountCell.createSpan({ cls: "count" });

				const cardNameCell = lineEl.createEl("td");
				const cardNameEl = cardNameCell.createSpan({ cls: "card-name" });
				const cardCommentsEl = cardNameCell.createSpan({
					cls: "comment",
					text: line.comments?.join("#") || "",
				});

				let cardPrice;
				let cardPriceEl;

				if (!settings.decklist.hidePrices) {
					const cardPriceCell = lineEl.createEl("td");
					cardPriceEl = cardPriceCell.createSpan({ cls: "card-price" });

					if (line.cardName) {
						cardPrice = getCardPrice(
							line.cardName,
							cardDataByCardId,
							settings
						);
					}
				}

				// Add hyperlink when possible
				if (line.cardName) {
					const cardId = nameToId(line.cardName);
					const cardInfo = cardDataByCardId[cardId];
					if (
						settings.decklist.showCardNamesAsHyperlinks &&
						cardInfo &&
						cardInfo.scryfall_uri
					) {
						const cardLinkEl = cardNameEl.createEl("a");
						cardLinkEl.href = cardInfo.scryfall_uri;
						cardLinkEl.textContent = `${cardInfo.name}`;
					} else {
						cardNameEl.textContent = `${
							(cardInfo && cardInfo.name) ||
							line.cardName ||
							UNKNOWN_CARD
						}`;
					}
				}

				if (line.errors && line.errors.length) {
					cardNameEl.createSpan({
						cls: "error",
						text: line.errors?.join(",") || "",
					});
				}

				const lineCardCount = line.cardCount || 0;
				const lineGlobalCount =
					line.globalCount === null ? -1 : line.globalCount || 0;

				// Show missing card counts
				if (lineGlobalCount !== -1 && lineCardCount > lineGlobalCount) {
					const counts = cardCountEl.createSpan({ cls: "count" });
					// Card error element
					counts.createSpan({
						cls: "error",
						text: `${lineGlobalCount}`,
					});
					// Card counts row element
					counts.createSpan({
						text: ` / ${lineCardCount}`,
					});
					lineEl.classList.add("insufficient-count");

					const cardId = nameToId(line.cardName);
					missingCardCounts[cardId] =
						(missingCardCounts[cardId] || 0) +
						(lineCardCount - lineGlobalCount);

					sectionMissingCardCounts[cardId] =
						(sectionMissingCardCounts[cardId] || 0) +
						(lineCardCount - lineGlobalCount);

					if (cardPrice) {
						cardPriceEl!.classList.add("insufficient-count");

						const totalPrice: number =
							lineCardCount * parseFloat(cardPrice);
						const amountOwned: number =
							lineGlobalCount * parseFloat(cardPrice);

						cardPriceEl!.createSpan({
							cls: "error",
							text: `${
								currencyMapping[
									settings.decklist.preferredCurrency
								]
							}${amountOwned.toFixed(2)}`,
						});

						cardPriceEl!.createSpan({
							text: ` / ${
								currencyMapping[
									settings.decklist.preferredCurrency
								]
							}${totalPrice.toFixed(2)}`,
						});

						// Add cost to total
						sectionTotalCost[section] =
							sectionTotalCost[section] + (totalPrice || 0.0);
					}
				} else {
					cardCountEl.textContent = `${lineCardCount}`;

					if (cardPrice) {
						const totalPrice: number =
							lineCardCount * parseFloat(cardPrice);
						const displayPrice = `${
							currencyMapping[settings.decklist.preferredCurrency]
						}${totalPrice.toFixed(2)}`;

						cardPriceEl!.textContent = displayPrice;

						// Add cost to total
						sectionTotalCost[section] =
							sectionTotalCost[section] + (totalPrice || 0.0);
					}
				}

				sectionTotalCounts[section] =
					sectionTotalCounts[section] + (line.cardCount || 0);

				if (settings.decklist.showCardPreviews) {
					// Event handlers for card artwork popover
					lineEl.addEventListener("mouseenter", () => {
						const cardId = nameToId(line.cardName);
						const cardInfo = cardDataByCardId[cardId];
						let imgUri: string | undefined;
						if (cardInfo) {
							// For single-faced cards...
							if (cardInfo.image_uris) {
								imgUri = cardInfo.image_uris?.large;
								// For double-faced cards...
							} else if (
								cardInfo.card_faces &&
								cardInfo.card_faces.length > 1
							) {
								// Use the front-side of the card for preview
								imgUri =
									cardInfo.card_faces[0].image_uris?.large;
							}
							const offsetPaddingTop = 16;
							imgElContainer.style.top = `${
								lineEl.offsetTop + offsetPaddingTop
							}px`;
							imgElContainer.style.left = `${cardCommentsEl.offsetLeft}px`;
						}
						if (typeof imgUri !== "undefined") {
							imgEl.src = imgUri;
						}
					});

					lineEl.addEventListener("mouseleave", () => {
						imgEl.src = "";
					});
				}
			} else if (line.lineType === "comment") {
				// Comments
				lineEl.createSpan({
					cls: "comment",
					text: line.comments?.join(" ") || "",
				});
			}
		});

		sectionHeadingEl.textContent = `${section}`;

		sectionContainer.createEl("hr");

		const totalsEl = sectionContainer.createDiv({
			cls: "decklist__section-totals",
		});

		const sectionMissingCardIds = Object.keys(sectionMissingCardCounts);

		const totalCardsEl = totalsEl.createSpan({ cls: "decklist__section-totals__count" });
		const totalCostEl = totalsEl.createSpan({ cls: "decklist__section-totals__cost" });

		// When there are missing cards, show fraction
		if (sectionMissingCardIds.length) {
			// Counts
			const totalMissingCountInSection = Object.values(
				sectionMissingCardCounts
			).reduce((acc, v) => acc + v, 0);

			const totalCardsOwned =
				sectionTotalCounts[section] - totalMissingCountInSection;

			// Errors
			totalCardsEl.createSpan({
				cls: "error",
				text: `${totalCardsOwned}`,
			});

			// Counts
			totalCardsEl.createSpan({
				cls: "insufficient-count",
				text: ` / ${sectionTotalCounts[section]}`,
			});

			const totalMissingCostInSection = Object.keys(
				sectionMissingCardCounts
			).reduce((acc, cardId) => {
				const countNeeded = sectionMissingCardCounts[cardId];
				const cardPrice: number = parseFloat(
					getCardPrice(cardId, cardDataByCardId, settings) || "0.00"
				);
				return acc + cardPrice * countNeeded;
			}, 0.0);

			// Value
			if (hasCardInfo && !settings.decklist.hidePrices) {
				const totalValueOwned =
					sectionTotalCost[section] - totalMissingCostInSection;
				totalCostEl.createSpan({
					cls: "error",
					text: `${
						currencyMapping[settings.decklist.preferredCurrency]
					}${totalValueOwned.toFixed(2)}`,
				});

				// Total value needed
				totalCostEl.createSpan({
					cls: "insufficient-count",
					text: ` / ${
						currencyMapping[settings.decklist.preferredCurrency]
					}${sectionTotalCost[section].toFixed(2)}`,
				});
			}

		} else {
			totalCardsEl.textContent = `${sectionTotalCounts[section]}`;
			if (!settings.decklist.hidePrices) {
				totalCostEl.textContent = `${
					currencyMapping[settings.decklist.preferredCurrency]
				}${sectionTotalCost[section].toFixed(2)}`;
			}
		}

		totalsEl.createSpan({
			cls: "card-name",
			text: "cards",
		});

		if (hasCardInfo && !settings.decklist.hidePrices) {
			totalsEl.appendChild(totalCostEl);
		}

		sectionContainers.push(sectionContainer);
	});

	sectionContainers.forEach((sectionContainer) =>
		containerEl.appendChild(sectionContainer)
	);

	const buylistCardIds = Object.keys(missingCardCounts);
	const buylistCardCounts = Object.values(missingCardCounts).reduce(
		(acc, val) => acc + val,
		0
	);

	// Only show the buylist element when there are missing cards
	if (buylistCardIds.length && settings.decklist.showBuylist) {
		// Build buylist
		const buylist = footer.createDiv({ cls: "buylist-container" });

		const buylistHeader = buylist.createEl("h3", { cls: "decklist__section-heading" });
		buylistHeader.textContent = "Buylist: ";

		let totalCostOfBuylist = 0.0;
		let buylistLines = "";

		buylistCardIds.forEach((cardId) => {
			const cardInfo = cardDataByCardId[cardId];
			let buylistLine = "";

			const countNeeded = missingCardCounts[cardId];

			// Add count
			buylistLine += `${countNeeded}` + " ";

			if (cardInfo) {
				const cardName = cardInfo.name || "";
				buylistLine += `${cardName}`;

				// Retrieve price
				const cardPrice: number = parseFloat(
					getCardPrice(cardName, cardDataByCardId, settings) || "0.00"
				);

				totalCostOfBuylist =
					totalCostOfBuylist + cardPrice * countNeeded;

				buylistLines += buylistLine + "\n";
			} else {
				// Card name might be unknown
				buylistLines += buylistLine + `${cardId || UNKNOWN_CARD}\n`;
			}
		});

		const buylistPre = buylist.createEl("pre", { cls: "buylist-container" });
		buylistPre.textContent = buylistLines;

		buylist.createEl("hr");

		const buylistLineEl = buylist.createDiv({ cls: "buylist-line" });

		buylistLineEl.createSpan({
			cls: "decklist__section-totals__count",
			text: `${buylistCardCounts} `,
		});

		buylistLineEl.createSpan({
			cls: "card-name",
			text: "cards",
		});

		if (hasCardInfo && !settings.decklist.hidePrices) {
			buylistLineEl.createSpan({
				cls: "decklist__section-totals",
				text: `${
					currencyMapping[settings.decklist.preferredCurrency]
				}${totalCostOfBuylist.toFixed(2)}`,
			});
		}
	}

	containerEl.appendChild(footer);

	return containerEl;
};