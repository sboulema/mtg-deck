import { nameToId } from "./collection";
import { CardData } from "./scryfall";
import { Line } from "./types";

export const buildCardGrid = (
	container: HTMLElement,
	lines: Line[],
	cardDataByCardId: Record<string, CardData>
): HTMLElement => {
	const cardGrid = container.createDiv({ cls: "decklist__card-grid" });
	cardGrid.style.display = "none";

	lines
		.filter((line) => line.lineType === "card" && line.cardName)
		.forEach((line) => {
			const cardId = nameToId(line.cardName!);
			const cardInfo = cardDataByCardId[cardId];
			const imgUri =
				cardInfo?.image_uris?.normal ??
				cardInfo?.card_faces?.[0]?.image_uris?.normal;

			if (!imgUri) return;

			const cardEl = cardGrid.createDiv({ cls: "decklist__card-grid__item" });
			cardEl.createEl("img", {
				attr: { src: imgUri },
				cls: "decklist__card-grid__image",
			});
			cardEl.createSpan({
				cls: "decklist__card-grid__count",
				text: `${line.cardCount}x`,
			});
		});

	return cardGrid;
};

export const setupGridToggle = (
	toggleBtn: HTMLElement,
	cardGrid: HTMLElement,
	sectionList: HTMLElement
): void => {
	toggleBtn.addEventListener("click", () => {
		const isGridVisible = cardGrid.style.display !== "none";
		cardGrid.style.display = isGridVisible ? "none" : "flex";
		sectionList.style.display = isGridVisible ? "" : "none";
		toggleBtn.textContent = isGridVisible ? "Visual View" : "List View";
	});
};
