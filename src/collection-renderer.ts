import { CardCollection, nameToId } from "./collection";
import { CardData, fetchCardDataFromScryfallCached } from "./scryfall";

const renderRows = (
    tbody: HTMLElement,
    entries: string[],
    collections: CardCollection[],
    cardDataByCardId: Record<string, CardData>,
    filter: string
) => {
    tbody.empty();

    entries
        .filter(name => name.includes(filter.toLowerCase()))
        .forEach(name => {
            const cardInfo = cardDataByCardId[nameToId(name)];
            const row = tbody.createEl("tr");

            // Name cell with rarity dot and hyperlink
            const nameCell = row.createEl("td", { cls: "max" });
            nameCell.createSpan({ cls: `card-rarity ${cardInfo?.rarity ?? ""}` });
            const nameEl = nameCell.createSpan({ cls: "card-name" });

            if (cardInfo?.scryfall_uri) {
                const link = nameEl.createEl("a");
                link.href = cardInfo.scryfall_uri;
                link.textContent = cardInfo.printed_name ?? cardInfo.name ?? name;
            } else {
                nameEl.textContent = cardInfo?.printed_name ?? cardInfo?.name ?? name;
            }

            // Mana cost cell
            const costEl = row.createEl("td").createSpan({ cls: "card-cost" });
            const manaCost = cardInfo?.mana_cost ?? cardInfo?.card_faces?.[0]?.mana_cost;

            if (manaCost) {
                manaCost
                    .split("//")
                    .map(part => part.trim())
                    .forEach((part, index) => {
                        if (index > 0) {
                            costEl.createSpan({ cls: "card-cost-divider" });
                        }
                        part
                            .replace(/\//g, "")
                            .split("{")
                            .slice(1)
                            .forEach(symbol => {
                                costEl.createEl("img", {
                                    attr: {
                                        src: `https://svgs.scryfall.io/card-symbols/${symbol.slice(0, -1)}.svg`,
                                        width: 18,
                                        height: 18,
                                    },
                                });
                            });
                    });
            }

            // Per-collection count cells
            let total = 0;
            collections.forEach(c => {
                const count = c.counts[name] ?? 0;
                total += count;
                row.createEl("td", { text: count > 0 ? `${count}` : "-" });
            });

            // Total cell
            row.createEl("td", { text: `${total}` });
        });
};

export const renderCollection = async (
    root: HTMLElement,
    collections: CardCollection[]
): Promise<void> => {
    const containerEl = root.createDiv({ cls: "decklist" });

    const searchEl = containerEl.createEl("input", {
        attr: { type: "text", placeholder: "Search cards..." },
        cls: "collection__search",
    });

    const table = containerEl.createEl("table");
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "Name", cls: "max" });
    headerRow.createEl("th", { text: "Cost" });
    collections.forEach(c => {
        headerRow.createEl("th", { text: c.fileName });
    });
    headerRow.createEl("th", { text: "Total" });

    const tbody = table.createEl("tbody");

    // Build sorted list of all unique card names across all collections
    const allCardNames = Array.from(
        new Set(collections.flatMap(c => Object.keys(c.counts)))
    ).sort((a, b) => a.localeCompare(b));

    // Render skeleton immediately
    renderRows(tbody, allCardNames, collections, {}, "");

    const loadingEl = containerEl.createDiv({ cls: "collection__loading" });
    const progressEl = loadingEl.createSpan({ text: `0 / ${allCardNames.length}` });
    loadingEl.createDiv({ cls: "collection__spinner" });

    // Fetch card data and re-render
    const identifiers = allCardNames.map(name => ({ name }));
    const cardDataByCardId = await fetchCardDataFromScryfallCached(
        identifiers,
        (fetched, total) => {
            progressEl.textContent = `${fetched} / ${total}`;
        }
    );

    loadingEl.remove();

    renderRows(tbody, allCardNames, collections, cardDataByCardId, "");

    // Footer with per-collection totals and grand total
    const tfoot = table.createEl("tfoot", { cls: "decklist__section-totals" });
    const footRow = tfoot.createEl("tr");
    footRow.createEl("td", { text: "Total", cls: "max" });
    footRow.createEl("td");

    collections.forEach(c => {
        const total = Object.values(c.counts).reduce((acc, v) => acc + v, 0);
        footRow.createEl("td", { text: `${total}` });
    });

    const grandTotal = collections.reduce(
        (acc, c) => acc + Object.values(c.counts).reduce((a, v) => a + v, 0),
        0
    );
    footRow.createEl("td", { text: `${grandTotal}` });

    // Search filter
    searchEl.addEventListener("input", () => {
        renderRows(tbody, allCardNames, collections, cardDataByCardId, searchEl.value);
    });
};