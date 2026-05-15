import { nameToId } from "./collection";
import { CardData } from "./scryfall";
import { Line } from "./types";

export const buildCardGrid = (
    container: HTMLElement,
    lines: Line[],
    cardDataByCardId: Record<string, CardData>,
    imgElContainer: HTMLElement,
    imgEl: HTMLImageElement
): HTMLElement => {
    const cardGrid = container.createDiv({ cls: "decklist__card-grid" });

    lines
        .filter((line) => line.lineType === "card" && line.cardName)
        .forEach((line) => {
            const cardId = nameToId(line.cardName);
            const cardInfo = cardDataByCardId[cardId];
            const imgUri = cardInfo?.image_uris?.normal
                ?? cardInfo?.card_faces?.[0]?.image_uris?.normal;
            const largeImgUri = cardInfo?.image_uris?.large
                ?? cardInfo?.card_faces?.[0]?.image_uris?.large;

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

            if (cardInfo?.scryfall_uri) {
                cardEl.setCssProps({cursor: "pointer"});
                cardEl.addEventListener("click", () => {
                    window.open(cardInfo.scryfall_uri, "_blank");
                });
            }

            cardEl.addEventListener("mouseenter", () => {
                if (!largeImgUri) return;

                const cardRect = cardEl.getBoundingClientRect();
                const top = cardRect.top;

                imgElContainer.setCssProps({
                    display: "block",
                    top: `${top}px`,
                });

                imgEl.src = largeImgUri;
            });

            cardEl.addEventListener("mouseleave", (e) => {
                if (!imgElContainer.contains(e.relatedTarget as Node) &&
                    e.relatedTarget !== imgElContainer) {
                    imgElContainer.setCssProps({ display: "none" });
                    imgEl.src = "";
                }
            });

            imgElContainer.addEventListener("mouseleave", (e) => {
                if (!cardGrid.contains(e.relatedTarget as Node)) {
                    imgElContainer.setCssProps({ display: "none" });
                    imgEl.src = "";
                }
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
		const isGridVisible = cardGrid.style.display === "flex";
        cardGrid.setCssProps({display: isGridVisible ? "none" : "flex"});
        sectionList.setCssProps({display: isGridVisible ? "" : "none"});
        toggleBtn.textContent = isGridVisible ? "Visual View" : "List View";
	});
};
