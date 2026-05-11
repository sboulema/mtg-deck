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

	const getImgUri = (
		info: CardData,
		index: number
	): string | undefined => {
		if (info.image_uris) {
			return info.image_uris.large;
		}
		return info.card_faces?.[index]?.image_uris?.large;
	};

	lineEl.addEventListener("mouseenter", () => {
		const cardInfo = cardDataByCardId[cardId];
		if (!cardInfo) return;

		faceIndex = 0;

		imgElContainer.style.display = "block";
		imgElContainer.style.top = `${lineEl.offsetTop}px`;
		imgElContainer.style.right = "50px";
		imgElContainer.style.left = "auto";

		const imgUri = getImgUri(cardInfo, faceIndex);
		if (imgUri) {
			imgEl.src = imgUri;
		}

		if (isDoubleFaced) {
			imgEl.style.cursor = "pointer";
			imgEl.onclick = () => {
				faceIndex = faceIndex === 0 ? 1 : 0;
				const uri = getImgUri(cardInfo, faceIndex);
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
		if (!imgElContainer.contains(e.relatedTarget as Node)) {
			imgElContainer.style.display = "none";
			imgEl.src = "";
			imgEl.onclick = null;
		}
	});

	imgElContainer.addEventListener("mouseleave", (e) => {
		if (!sectionList.contains(e.relatedTarget as Node)) {
			imgElContainer.style.display = "none";
			imgEl.src = "";
			imgEl.onclick = null;
		}
	});
};
