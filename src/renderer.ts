import { CardCounts, UNKNOWN_CARD } from "./collection";
import { CardData, fetchCardDataFromScryfall } from "./scryfall";
import { ObsidianPluginMtgSettings } from "./settings";
import { DEFAULT_SECTION_NAME, SKIP_SECTION_NAMES, Line } from "./types";
import { parseLines, buildDistinctCardList } from "./parser";
import { getCardPrice, currencyMapping } from "./pricing";
import { renderSection, renderSectionSkeleton } from "./section-renderer";

export { getCardPrice, fetchCardDataFromScryfall };

export const renderDecklist = async (
    root: Element,
    source: string,
    cardCounts: CardCounts,
    settings: ObsidianPluginMtgSettings,
    format: string | null = null,
    dataFetcher = fetchCardDataFromScryfall
): Promise<Element> => {
    const containerEl = root.createDiv({ cls: "decklist" });
    const lines = source.split("\n");
    const parsedLines = parseLines(lines, cardCounts);

    const linesBySection: Record<string, Line[]> = {};
    let currentSection = DEFAULT_SECTION_NAME;
    const sections: string[] = [];

    parsedLines.forEach((line, idx) => {
        if (idx === 0 && line.lineType !== "section") {
            sections.push(currentSection);
        }
        if (line.lineType === "section") {
            currentSection = line.text || DEFAULT_SECTION_NAME;
            sections.push(currentSection);
        } else {
            if (!linesBySection[currentSection]) {
                linesBySection[currentSection] = [];
            }
            linesBySection[currentSection].push(line);
        }
    });

    const filteredSections = sections.filter(s => !SKIP_SECTION_NAMES.includes(s));

    // Pass 1: render skeletons immediately
    const sectionContainers = filteredSections.map(section =>
        renderSectionSkeleton(containerEl, section, linesBySection[section] ?? [], settings)
    );
    sectionContainers.forEach(el => containerEl.appendChild(el));

    const footer = containerEl.createDiv({ cls: "footer" });
    containerEl.appendChild(footer);

    // Pass 2: fetch and enrich
    const distinctCards = buildDistinctCardList(parsedLines);
    let cardDataByCardId: Record<string, CardData> = {};

    try {
        cardDataByCardId = await dataFetcher(distinctCards);
    } catch (err) {
        console.error("Error fetching card data: ", err);
    }

    const hasCardInfo = Object.keys(cardDataByCardId).length > 0;
    const sectionTotalCounts: Record<string, number> = filteredSections.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    const sectionTotalCost: Record<string, number> = filteredSections.reduce((acc, s) => ({ ...acc, [s]: 0.0 }), {});
    const missingCardCounts: CardCounts = {};

    // Replace skeletons with fully rendered sections
    filteredSections.forEach((section, i) => {
        const enriched = renderSection(containerEl, {
            section,
            lines: linesBySection[section] ?? [],
            commanderLines: linesBySection["Commander"] ?? linesBySection["commander"] ?? [],
            companionLines: linesBySection["Companion"] ?? linesBySection["companion"] ?? [],
            cardDataByCardId,
            hasCardInfo,
            settings,
            missingCardCounts,
            sectionTotalCounts,
            sectionTotalCost,
            format,
        });
        sectionContainers[i].replaceWith(enriched);
    });

	// Buylist
	const buylistCardIds = Object.keys(missingCardCounts);
	const buylistCardCounts = Object.values(missingCardCounts).reduce(
		(acc, val) => acc + val,
		0
	);

	if (buylistCardIds.length && settings.decklist.showBuylist) {
		const buylist = footer.createDiv({ cls: "buylist-container" });
		const buylistHeader = buylist.createEl("h3", {
			cls: "decklist__section-heading",
		});
		buylistHeader.textContent = "Buylist: ";

		let totalCostOfBuylist = 0.0;
		let buylistLines = "";

		buylistCardIds.forEach((cardId) => {
			const cardInfo = cardDataByCardId[cardId];
			const countNeeded = missingCardCounts[cardId];
			let buylistLine = `${countNeeded} `;

			if (cardInfo) {
				const cardName = cardInfo.name || "";
				buylistLine += cardName;
				const cardPrice = parseFloat(
					getCardPrice(cardName, cardDataByCardId, settings) || "0.00"
				);
				totalCostOfBuylist += cardPrice * countNeeded;
			} else {
				buylistLine += cardId || UNKNOWN_CARD;
			}

			buylistLines += buylistLine + "\n";
		});

		buylist.createEl("pre", { cls: "buylist-container" }).textContent =
			buylistLines;
		buylist.createEl("hr");

		const buylistLineEl = buylist.createDiv({ cls: "buylist-line" });
		buylistLineEl.createSpan({
			cls: "decklist__section-totals__count",
			text: `${buylistCardCounts} `,
		});
		buylistLineEl.createSpan({ cls: "card-name", text: "cards" });

		if (hasCardInfo && settings.decklist.showCardPrices) {
			buylistLineEl.createSpan({
				cls: "decklist__section-totals",
				text: `${currencyMapping[settings.decklist.preferredCurrency]}${totalCostOfBuylist.toFixed(2)}`,
			});
		}
	}

	containerEl.appendChild(footer);

	return containerEl;
};
