import { CardCounts, nameToId, UNKNOWN_CARD } from "./collection";
import {
	CardIdentifier,
	CardData,
	getMultipleCardData,
	MAX_SCRYFALL_BATCH_SIZE,
	ScryfallResponse,
} from "./scryfall";
import { ObsidianPluginMtgSettings } from "./settings";

const DEFAULT_SECTION_NAME = "Deck:";
const COMMENT_DELIMITER = "#";
const SKIP_SECTION_NAMES = ["About", "Name"];

interface Line {
	lineType: "card" | "section" | "error" | "blank" | "comment";
	cardCount?: number;
	globalCount?: number | null;
	cardName?: string;
	cardSet?: string;
	cardNumber?: string;
	comments?: string[];
	errors?: string[];
	text?: string;
}

const lineMatchRE = /^(\d+)\s+(.*?)(\s+\(([A-Za-z0-9]{3})\)\s+0*(\d+))?$/;
const blankLineRE = /^\s+$/;
const headingMatchRE = new RegExp("^[^[0-9|" + COMMENT_DELIMITER + "]");

const currencyMapping = {
	usd: "$",
	eur: "€",
	tix: "Tx",
};

const cardTypeOrder = [
	"Planeswalker",
	"Creature",
	"Sorcery",
	"Instant",
	"Artifact",
	"Enchantment",
	"Land",
];

const getTypeOrder = (line: Line, cardDataByCardId: Record<string, CardData>): number => {
	if (line.lineType !== "card" || !line.cardName) {
		return 999;
	}

	const cardId = nameToId(line.cardName);
	const cardInfo = cardDataByCardId[cardId];

	if (!cardInfo?.type_line) {
		return 999;
	}

	const index = cardTypeOrder.findIndex(type => cardInfo.type_line!.includes(type));

	return index === -1 ? 999 : index;
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
			const cardSet: string = lineParts[4];
			const cardNumber: string = lineParts[5];
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
				cardSet,
				cardNumber,
				comments,
				errors,
			};
		}
	});
};

export const buildDistinctCardList = (lines: Line[]): CardIdentifier[] => {
	return Array.from(
		new Set(
			lines.flatMap((line): CardIdentifier[] => {
				if (line.lineType !== "card") {
					return [];
				} else if (line.cardSet === undefined) {
					return [
						{
							name: nameToId(line.cardName),
						},
					];
				} else if (line.cardNumber !== undefined) {
					return [
						{
							set: line.cardSet,
							collector_number: line.cardNumber,
						},
					];
				} else {
					// cardSet is defined but cardNumber is
					// undefined.  Should never happen.
					return [];
				}
			})
		)
	);
};

export const fetchCardDataFromScryfall = async (
	distinctCards: CardIdentifier[]
): Promise<Record<string, CardData>> => {
	// Fetch in batches of 75, since that's the limit of Scryfall batch sizes
	const batches: CardIdentifier[][] = [];
	let currentBatch: CardIdentifier[] = [];
	batches.push(currentBatch);
	distinctCards.forEach((identifier: CardIdentifier, idx: number) => {
		if (currentBatch.length === MAX_SCRYFALL_BATCH_SIZE) {
			batches.push(currentBatch);
			// Make new batch
			currentBatch = [];
		}
		currentBatch.push(identifier);
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

	// Create list of distinct cards
	const distinctCards: CardIdentifier[] = buildDistinctCardList(parsedLines);
	let cardDataByCardId: Record<string, CardData> = {};

	// Try to fetch data from Scryfall
	try {
		cardDataByCardId = await dataFetcher(distinctCards);
	} catch (err) {
		console.error("Error fetching card data: ", err);
	}

	// Determines whether any card info was found for the cards on the list
	const hasCardInfo = Object.keys(cardDataByCardId).length > 0;

	// Make elements from parsedLines
	const sectionContainers: Element[] = [];

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

	sections
		.filter(section => !SKIP_SECTION_NAMES.includes(section))
		.forEach((section: string) => {
			// Put the entire deck in containing div for styling
			const sectionContainer = containerEl.createDiv({ cls: "decklist__section-container" });
			const imgElContainer = sectionContainer.createDiv({ cls: "card-image-container" });
			const imgEl = imgElContainer.createEl("img", { cls: "card-image" });

			// Create a heading
			const sectionHeadingEl = sectionContainer.createEl("h3", { cls: "decklist__section-heading" });

			// Treat "Name" section as a special case since it's not really a section but more of a metadata field for the deck,
			// so we just show it as a heading without creating a table for it
			if (section.startsWith("Name")) {
				sectionHeadingEl.textContent = section.replace(/^Name\s+/, "");
				sectionContainers.push(sectionContainer);
				return;
			}

			// Create container for the table rows
			const sectionList = sectionContainer.createEl("table");
			const sectionListHead = sectionList.createEl("thead");
			const sectionListHeadRow = sectionListHead.createEl("tr");

			sectionListHeadRow.createEl("th", { text: "Count" });
			sectionListHeadRow.createEl("th", { text: "Name", cls: "max" });

			if (settings.decklist.showManaCosts) {
				sectionListHeadRow.createEl("th", { text: "Cost" });
			}

			if (!settings.decklist.hidePrices) {
				sectionListHeadRow.createEl("th", { text: "Price" });
			}

			const sectionListBody = sectionList.createEl("tbody");

			const sectionMissingCardCounts: CardCounts = {};

			// Sort lines by card type, preserving relative order of non-card lines
			const sortedLines = [...linesBySection[section]].sort((a, b) => {
				const typeOrder = getTypeOrder(a, cardDataByCardId) - getTypeOrder(b, cardDataByCardId);

				if (typeOrder !== 0) {
					return typeOrder;
				}

				return (a.cardName ?? "").localeCompare(b.cardName ?? "");
			});

			let previousTypeOrder = -1;

			// Create line item elements
			sortedLines.forEach((line: Line) => {
				const lineEl = sectionListBody.createEl("tr");

				if (line.lineType === "card") {
					const currentTypeOrder = getTypeOrder(line, cardDataByCardId);

					if (currentTypeOrder !== previousTypeOrder) {
						lineEl.classList.add("type-separator");
						previousTypeOrder = currentTypeOrder;
					}

					const cardCountCell = lineEl.createEl("td");
					const cardCountEl = cardCountCell.createSpan({ cls: "count" });

					const cardNameCell = lineEl.createEl("td");
					const cardNameEl = cardNameCell.createSpan({ cls: "card-name" });
					const cardCommentsEl = cardNameCell.createSpan({
						cls: "comment",
						text: line.comments?.join("#") || "",
					});

					if (settings.decklist.showManaCosts) {
						const cardCostCell = lineEl.createEl("td");
						const cardCostEl = cardCostCell.createSpan({ cls: "card-cost" });

						if (line.cardName) {
							const cardId = nameToId(line.cardName);
							const cardInfo = cardDataByCardId[cardId];
							const cardManaCost = cardInfo?.mana_cost
								?? cardInfo?.card_faces?.[0]?.mana_cost;

							if (cardManaCost) {
								cardManaCost
									.replace(/\//g, "")
									.split("{")
									.slice(1)
									.forEach(part => {
										cardCostEl.createEl("img", {
											attr: {
												src: `https://svgs.scryfall.io/card-symbols/${part.slice(0, -1)}.svg`,
												width: 18,
												height: 18,
											}
										});
									});
							}
						}
					}

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
							cardNameEl.textContent = `${(cardInfo && cardInfo.name) ||
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
								text: `${currencyMapping[
									settings.decklist.preferredCurrency
								]
									}${amountOwned.toFixed(2)}`,
							});

							cardPriceEl!.createSpan({
								text: ` / ${currencyMapping[
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
							const displayPrice = `${currencyMapping[settings.decklist.preferredCurrency]
								}${totalPrice.toFixed(2)}`;

							cardPriceEl!.textContent = displayPrice;

							// Add cost to total
							sectionTotalCost[section] =
								sectionTotalCost[section] + (totalPrice || 0.0);
						}
					}

					sectionTotalCounts[section] =
						sectionTotalCounts[section] + (line.cardCount || 0);

					// Show card preview on hover
					if (settings.decklist.showCardPreviews && line.cardName) {
						const cardId = nameToId(line.cardName);
						const cardInfo = cardDataByCardId[cardId];
						const isDoubleFaced = (cardInfo?.card_faces?.length ?? 0) > 1
							&& !cardInfo?.image_uris;

						let faceIndex = 0;

						lineEl.addEventListener("mouseenter", () => {
							const cardId = nameToId(line.cardName);
							const cardInfo = cardDataByCardId[cardId];
							if (!cardInfo) return;

							faceIndex = 0;

							const getImgUri = (index: number): string | undefined => {
								if (cardInfo.image_uris) {
									return cardInfo.image_uris.large;
								}
								return cardInfo.card_faces?.[index]?.image_uris?.large;
							};

							imgElContainer.style.display = "block";
							imgElContainer.style.top = `${lineEl.offsetTop}px`;
							imgElContainer.style.right = "50px";
							imgElContainer.style.left = "auto";

							const imgUri = getImgUri(faceIndex);
							if (imgUri) {
								imgEl.src = imgUri;
							}

							if (isDoubleFaced) {
								imgEl.style.cursor = "pointer";
								imgEl.onclick = () => {
									faceIndex = faceIndex === 0 ? 1 : 0;
									const uri = getImgUri(faceIndex);
									if (uri) {
										imgEl.src = uri;
									}
								};
							} else {
								imgEl.style.cursor = "default";
								imgEl.onclick = null;
							}
						});

						lineEl.addEventListener("mouseleave", (e) => {
							// Only hide if we're not moving onto the image container
							if (!imgElContainer.contains(e.relatedTarget as Node)) {
								imgElContainer.style.display = "none";
								imgEl.src = "";
								imgEl.onclick = null;
							}
						});

						imgElContainer.addEventListener("mouseleave", (e) => {
							// Only hide if we're not moving back onto a table row
							if (!sectionList.contains(e.relatedTarget as Node)) {
								imgElContainer.style.display = "none";
								imgEl.src = "";
								imgEl.onclick = null;
							}
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

			const sectionListFoot = sectionList.createEl("tfoot", { cls: "decklist__section-totals" });
			const sectionListFootRow = sectionListFoot.createEl("tr");
			const totalCardsEl = sectionListFootRow.createEl("td", { cls: "decklist__section-totals__count fit" });
			sectionListFootRow.createEl("td", { text: "Cards" });
			sectionListFootRow.createEl("td");

			let totalCostEl;
			if (hasCardInfo && !settings.decklist.hidePrices) {
				totalCostEl = sectionListFootRow.createEl("td", { cls: "decklist__section-totals__cost fit" });
			}

			sectionHeadingEl.textContent = `${section}`;

			const sectionMissingCardIds = Object.keys(sectionMissingCardCounts);

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
					totalCostEl!.createSpan({
						cls: "error",
						text: `${currencyMapping[settings.decklist.preferredCurrency]
							}${totalValueOwned.toFixed(2)}`,
					});

					// Total value needed
					totalCostEl!.createSpan({
						cls: "insufficient-count",
						text: ` / ${currencyMapping[settings.decklist.preferredCurrency]
							}${sectionTotalCost[section].toFixed(2)}`,
					});
				}

			} else {
				totalCardsEl.textContent = `${sectionTotalCounts[section]}`;
				if (!settings.decklist.hidePrices) {
					totalCostEl!.textContent = `${currencyMapping[settings.decklist.preferredCurrency]
						}${sectionTotalCost[section].toFixed(2)}`;
				}
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
				text: `${currencyMapping[settings.decklist.preferredCurrency]
					}${totalCostOfBuylist.toFixed(2)}`,
			});
		}
	}

	containerEl.appendChild(footer);

	return containerEl;
};