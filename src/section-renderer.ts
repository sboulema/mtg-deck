import { CardCounts, nameToId, UNKNOWN_CARD } from "./collection";
import { CardData } from "./scryfall";
import { ObsidianPluginMtgSettings } from "./settings";
import { Line } from "./types";
import { currencyMapping, getCardPrice } from "./pricing";
import { cardTypeIcons, cardTypeOrder, getTypeCounts, getTypeOrder, sortLines } from "./sorting";
import { setupCardPreview } from "./card-preview";
import { buildCardGrid, setupGridToggle } from "./card-grid";
import { sanitizeHTMLToDom } from "obsidian";

export interface SectionRenderContext {
	section: string;
	lines: Line[];
	cardDataByCardId: Record<string, CardData>;
	hasCardInfo: boolean;
	settings: ObsidianPluginMtgSettings;
	missingCardCounts: CardCounts;
	sectionTotalCounts: Record<string, number>;
	sectionTotalCost: Record<string, number>;
}

export const renderSection = (
	containerEl: HTMLElement,
	ctx: SectionRenderContext
): HTMLElement => {
	const {
		section,
		lines,
		cardDataByCardId,
		hasCardInfo,
		settings,
		missingCardCounts,
		sectionTotalCounts,
		sectionTotalCost,
	} = ctx;

	const sectionContainer = containerEl.createDiv({
		cls: "decklist__section-container",
	});

	// Heading container with toggle button
	const sectionHeadingContainer = sectionContainer.createDiv({
		cls: "decklist__section-heading-container",
	});
	const sectionHeadingEl = sectionHeadingContainer.createEl("h3", {
		cls: "decklist__section-heading",
	});
	const toggleViewBtn = sectionHeadingContainer.createEl("button", {
		text: "Visual View",
		cls: "decklist__toggle-view",
	});

	const hasCards = lines.some(line => line.lineType === "card" && line.cardName);
	toggleViewBtn.style.display = hasCards ? "" : "none";

	// Card preview image container
	const imgElContainer = sectionContainer.createDiv({
		cls: "card-image-container",
	});
	const imgEl = imgElContainer.createEl("img", { cls: "card-image" });

	// Handle "Name ..." metadata sections
	if (section.startsWith("Name")) {
		sectionHeadingEl.textContent = section.replace(/^Name\s+/, "");
		return sectionContainer;
	}

	sectionHeadingEl.textContent = section;

	// Table
	const sectionList = sectionContainer.createEl("table");
	const sectionListHead = sectionList.createEl("thead");
	const sectionListHeadRow = sectionListHead.createEl("tr");

	sectionListHeadRow.createEl("th", { text: "Count" });
	sectionListHeadRow.createEl("th", { text: "Name", cls: "max" });

	if (settings.decklist.showManaCosts) {
		sectionListHeadRow.createEl("th", { text: "Cost" });
	}
	if (settings.decklist.showCardPrices) {
		sectionListHeadRow.createEl("th", { text: "Price" });
	}

	const sectionListBody = sectionList.createEl("tbody");
	const sectionMissingCardCounts: CardCounts = {};

	// Card grid (visual view)
	const cardGrid = buildCardGrid(sectionContainer, sortLines(lines, cardDataByCardId), cardDataByCardId);
	setupGridToggle(toggleViewBtn, cardGrid, sectionList);

	// Sort and render lines
	const sortedLines = sortLines(lines, cardDataByCardId);
	let previousTypeOrder = -1;

	sortedLines.forEach((line: Line) => {
		const lineEl = sectionListBody.createEl("tr");

		if (line.lineType === "card") {
			const cardId = nameToId(line.cardName!);
			const cardInfo = cardDataByCardId[cardId];
			const currentTypeOrder = getTypeOrder(line, cardDataByCardId);

			if (currentTypeOrder !== previousTypeOrder) {
				lineEl.classList.add("type-separator");
				previousTypeOrder = currentTypeOrder;
			}

			// Count cell
			const cardCountCell = lineEl.createEl("td");
			cardCountCell.createSpan({ cls: `card-rarity ${cardInfo?.rarity}` });
			const cardCountEl = cardCountCell.createSpan({ cls: "count" });

			// Name cell
			const cardNameCell = lineEl.createEl("td");
			const cardNameEl = cardNameCell.createSpan({ cls: "card-name" });
			const cardCommentsEl = cardNameCell.createSpan({
				cls: "comment",
				text: line.comments?.join("#") || "",
			});

			// Mana cost cell
			if (settings.decklist.showManaCosts) {
				const cardCostCell = lineEl.createEl("td");
				const cardCostEl = cardCostCell.createSpan({ cls: "card-cost" });
				const cardManaCost =
					cardInfo?.mana_cost ?? cardInfo?.card_faces?.[0]?.mana_cost;

				if (cardManaCost) {
					cardManaCost
						.replace(/\//g, "")
						.split("{")
						.slice(1)
						.forEach((part) => {
							cardCostEl.createEl("img", {
								attr: {
									src: `https://svgs.scryfall.io/card-symbols/${part.slice(0, -1)}.svg`,
									width: 18,
									height: 18,
								},
							});
						});
				}
			}

			// Price cell
			let cardPrice: string | null = null;
			let cardPriceEl: HTMLElement | undefined;

			if (settings.decklist.showCardPrices) {
				const cardPriceCell = lineEl.createEl("td");
				cardPriceEl = cardPriceCell.createSpan({ cls: "card-price" });
				if (line.cardName) {
					cardPrice = getCardPrice(line.cardName, cardDataByCardId, settings);
				}
			}

			// Card name / hyperlink
			if (line.cardName) {
				if (settings.decklist.showCardNamesAsHyperlinks && cardInfo?.scryfall_uri) {
					const cardLinkEl = cardNameEl.createEl("a");
					cardLinkEl.href = cardInfo.scryfall_uri;
					cardLinkEl.textContent = cardInfo.name ?? line.cardName;
				} else {
					cardNameEl.textContent =
						cardInfo?.name ?? line.cardName ?? UNKNOWN_CARD;
				}
			}

			if (line.errors?.length) {
				cardNameEl.createSpan({
					cls: "error",
					text: line.errors.join(","),
				});
			}

			const lineCardCount = line.cardCount || 0;
			const lineGlobalCount =
				line.globalCount === null ? -1 : line.globalCount || 0;

			if (lineGlobalCount !== -1 && lineCardCount > lineGlobalCount) {
				// Insufficient count display
				const counts = cardCountEl.createSpan({ cls: "count" });
				counts.createSpan({ cls: "error", text: `${lineGlobalCount}` });
				counts.createSpan({ text: ` / ${lineCardCount}` });
				lineEl.classList.add("insufficient-count");

				missingCardCounts[cardId] =
					(missingCardCounts[cardId] || 0) + (lineCardCount - lineGlobalCount);
				sectionMissingCardCounts[cardId] =
					(sectionMissingCardCounts[cardId] || 0) +
					(lineCardCount - lineGlobalCount);

				if (cardPrice && cardPriceEl) {
					cardPriceEl.classList.add("insufficient-count");
					const totalPrice = lineCardCount * parseFloat(cardPrice);
					const amountOwned = lineGlobalCount * parseFloat(cardPrice);
					const currency = currencyMapping[settings.decklist.preferredCurrency];

					cardPriceEl.createSpan({
						cls: "error",
						text: `${currency}${amountOwned.toFixed(2)}`,
					});
					cardPriceEl.createSpan({
						text: ` / ${currency}${totalPrice.toFixed(2)}`,
					});

					sectionTotalCost[section] += totalPrice || 0;
				}
			} else {
				cardCountEl.textContent = `${lineCardCount}`;

				if (cardPrice && cardPriceEl) {
					const totalPrice = lineCardCount * parseFloat(cardPrice);
					cardPriceEl.textContent = `${currencyMapping[settings.decklist.preferredCurrency]}${totalPrice.toFixed(2)}`;
					sectionTotalCost[section] += totalPrice || 0;
				}
			}

			sectionTotalCounts[section] += line.cardCount || 0;

			// Card preview on hover
			if (settings.decklist.showCardPreviews && line.cardName) {
				setupCardPreview(
					lineEl,
					line.cardName,
					cardDataByCardId,
					imgElContainer,
					imgEl,
					sectionList
				);
			}
		} else if (line.lineType === "comment") {
			lineEl.createSpan({
				cls: "comment",
				text: line.comments?.join(" ") || "",
			});
		}
	});

	// Footer
	const sectionListFoot = sectionList.createEl("tfoot", {
		cls: "decklist__section-totals",
	});
	const sectionListFootRow = sectionListFoot.createEl("tr");
	const totalCardsEl = sectionListFootRow.createEl("td", {
		cls: "decklist__section-totals__count",
	});
	const totalTypeCardsEl = sectionListFootRow.createEl("td");

	const typeCounts = getTypeCounts(lines, cardDataByCardId);
	cardTypeOrder
		.filter(type => typeCounts[type] > 0)
		.forEach(type => {
			const item = totalTypeCardsEl.createSpan({ cls: "type-summary__item" });
			const svgEl = sanitizeHTMLToDom(cardTypeIcons[type]);
			item.appendChild(svgEl);
			item.createSpan({ text: ` ${typeCounts[type]}` });
		});

	sectionListFootRow.createEl("td");

	let totalCostEl: HTMLElement | undefined;
	if (hasCardInfo && settings.decklist.showCardPrices) {
		totalCostEl = sectionListFootRow.createEl("td", {
			cls: "decklist__section-totals__cost",
		});
	}

	const sectionMissingCardIds = Object.keys(sectionMissingCardCounts);

	if (sectionMissingCardIds.length) {
		const totalMissingCount = Object.values(sectionMissingCardCounts).reduce(
			(acc, v) => acc + v,
			0
		);
		const totalCardsOwned = sectionTotalCounts[section] - totalMissingCount;

		totalCardsEl.createSpan({ cls: "error", text: `${totalCardsOwned}` });
		totalCardsEl.createSpan({
			cls: "insufficient-count",
			text: ` / ${sectionTotalCounts[section]}`,
		});

		if (hasCardInfo && settings.decklist.showCardPrices && totalCostEl) {
			const totalMissingCost = sectionMissingCardIds.reduce((acc, cardId) => {
				const countNeeded = sectionMissingCardCounts[cardId];
				const price = parseFloat(
					getCardPrice(cardId, cardDataByCardId, settings) || "0.00"
				);
				return acc + price * countNeeded;
			}, 0);

			const totalValueOwned = sectionTotalCost[section] - totalMissingCost;
			const currency = currencyMapping[settings.decklist.preferredCurrency];

			totalCostEl.createSpan({
				cls: "error",
				text: `${currency}${totalValueOwned.toFixed(2)}`,
			});
			totalCostEl.createSpan({
				cls: "insufficient-count",
				text: ` / ${currency}${sectionTotalCost[section].toFixed(2)}`,
			});
		}
	} else {
		totalCardsEl.textContent = `${sectionTotalCounts[section]}`;
		if (settings.decklist.showCardPrices && totalCostEl) {
			totalCostEl.textContent = `${currencyMapping[settings.decklist.preferredCurrency]}${sectionTotalCost[section].toFixed(2)}`;
		}
	}

	return sectionContainer;
};

export const renderSectionSkeleton = (
    containerEl: HTMLElement,
    section: string,
    lines: Line[],
    settings: ObsidianPluginMtgSettings
): HTMLElement => {
    const sectionContainer = containerEl.createDiv({ cls: "decklist__section-container" });

    const sectionHeadingContainer = sectionContainer.createDiv({ cls: "decklist__section-heading-container" });
    const sectionHeadingEl = sectionHeadingContainer.createEl("h3", { cls: "decklist__section-heading" });
    sectionHeadingEl.textContent = section.startsWith("Name")
        ? section.replace(/^Name\s+/, "")
        : section;

    if (section.startsWith("Name")) {
        return sectionContainer;
    }

    const sectionList = sectionContainer.createEl("table");
    const sectionListHead = sectionList.createEl("thead");
    const sectionListHeadRow = sectionListHead.createEl("tr");

    sectionListHeadRow.createEl("th", { text: "Count" });
    sectionListHeadRow.createEl("th", { text: "Name", cls: "max" });

    if (settings.decklist.showManaCosts) {
        sectionListHeadRow.createEl("th", { text: "Cost" });
    }
    if (settings.decklist.showCardPrices) {
        sectionListHeadRow.createEl("th", { text: "Price" });
    }

    const sectionListBody = sectionList.createEl("tbody");

    lines.forEach((line: Line) => {
        const lineEl = sectionListBody.createEl("tr");

        if (line.lineType === "card") {
            lineEl.setAttribute("data-card-name", line.cardName ?? "");

            const cardCountCell = lineEl.createEl("td");
            cardCountCell.createSpan({ cls: "card-rarity" });
            cardCountCell.createSpan({ cls: "count", text: `${line.cardCount}` });

            const cardNameCell = lineEl.createEl("td");
            cardNameCell.createSpan({ cls: "card-name", text: line.cardName ?? "" });
            cardNameCell.createSpan({ cls: "comment", text: line.comments?.join("#") || "" });

            if (settings.decklist.showManaCosts) {
                lineEl.createEl("td").createSpan({ cls: "card-cost" });
            }
            if (settings.decklist.showCardPrices) {
                lineEl.createEl("td").createSpan({ cls: "card-price" });
            }
        } else if (line.lineType === "comment") {
            lineEl.createSpan({ cls: "comment", text: line.comments?.join(" ") || "" });
        }
    });

    sectionList.createEl("tfoot", { cls: "decklist__section-totals" })
        .createEl("tr")
        .createEl("td", { attr: { colspan: "4" } });

    return sectionContainer;
};