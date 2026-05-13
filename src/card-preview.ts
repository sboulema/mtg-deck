import { nameToId } from "./collection";
import { CardData } from "./scryfall";

export const setupCardPreview = (
	lineEl: HTMLElement,
	cardName: string,
	cardDataByCardId: Record<string, CardData>,
	imgElContainer: HTMLElement,
	imgEl: HTMLImageElement,
	sectionList: HTMLElement
): void => {
	const cardId = nameToId(cardName);
	const cardInfo = cardDataByCardId[cardId];
	const isDoubleFaced =
		(cardInfo?.card_faces?.length ?? 0) > 1 && !cardInfo?.image_uris;

	let faceIndex = 0;

	lineEl.addEventListener("mouseenter", () => {
		const cardInfo = cardDataByCardId[cardId];
		if (!cardInfo) return;

		faceIndex = 0;

		const getImgUri = (index: number): string | undefined => {
			if (cardInfo.image_uris) {
				return cardInfo.image_uris.large;
			}
			return cardInfo.card_faces?.[index]?.image_uris?.large;
		};

		const rect = lineEl.getBoundingClientRect();
		imgElContainer.setCssProps({
			display: "block",
			position: "fixed",
			top: `${rect.top}px`,
			right: `${window.innerWidth - rect.right}px`,
			left: "auto",
			zIndex: "1000",
		});

		const imgUri = getImgUri(faceIndex);
		if (imgUri) {
			imgEl.src = imgUri;
		}

		if (isDoubleFaced) {
			imgEl.setCssProps({cursor: "pointer"});
			imgEl.onclick = () => {
				faceIndex = faceIndex === 0 ? 1 : 0;
				const uri = getImgUri(faceIndex);
				if (uri) {
					imgEl.src = uri;
				}
			};
		} else {
			imgEl.setCssProps({cursor: "default"});
			imgEl.onclick = null;
		}
	});

	lineEl.addEventListener("mouseleave", (e) => {
		if (!imgElContainer.contains(e.relatedTarget as Node)) {
			imgElContainer.setCssProps({display: "none"});
			imgEl.src = "";
			imgEl.onclick = null;
		}
	});

	imgElContainer.addEventListener("mouseleave", (e) => {
		if (!sectionList.contains(e.relatedTarget as Node)) {
			imgElContainer.setCssProps({display: "none"});
			imgEl.src = "";
			imgEl.onclick = null;
		}
	});
};
