import { nameToId } from "./collection";
import { promiseWrappedRequest } from "./http";

const cardDataCache: Record<string, CardData> = {};

export type CardIdentifier =
	| {
			name: string;
	  }
	| {
			set: string;
			collector_number: string;
	  };

export interface RequestOptions {
    url: string;
    method?: string;
    body?: string;
    contentType?: string;
    throw?: boolean;
    headers?: Record<string, string>;
}

export type Request = <T>(options: RequestOptions) => Promise<T>;

// This is the maximum number of cards that can be requested at the same time
export const MAX_SCRYFALL_BATCH_SIZE = 75;

export interface CardFace {
    object?: string; // card_face
    name?: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    colors?: string[];
    power?: string;
    toughness?: string;
    flavor_text?: string;
    flavor_name?: string;
    color_indicator?: string[];
    artist?: string;
    artist_id?: string;
    illustration_id?: string;
    image_uris?: {
        small: string;
        normal: string;
        large: string;
        png: string;
        art_crop: string;
        border_crop: string;
    };
}

export interface CardData {
    object?: string; // card
    id?: string;
    oracle_id?: string;
    multiverse_ids?: number[];
    mtgo_id?: number;
    arena_id?: number;
    tcgplayer_id?: number;
    cardmarket_id?: number;
    name?: string;
    lang?: string;
    released_at?: string;
    uri?: string;
    scryfall_uri?: string;
    layout?: string;
    highres_image?: boolean;
    image_status?: string;
    cmc?: number;
    mana_cost?: string;
    type_line?: string;
    color_identity?: string[];
    keywords?: string[];
    card_faces?: CardFace[];
    legalities?: Record<string, string>;
    games?: string[];
    reserved?: boolean;
    foil?: boolean;
    nonfoil?: boolean;
    finishes?: string[];
    oversized?: boolean;
    promo?: boolean;
    reprint?: boolean;
    variation?: boolean;
    set_id?: string;
    set: string;
    set_name: string;
    set_type: string;
    set_uri: string;
    set_search_uri: string;
    scryfall_set_uri: string;
    rulings_uri: string;
    prints_search_uri: string;
    collector_number: string;
    digital: boolean;
    rarity: string;
    artist: string;
    artist_ids: string[];
    border_color: string;
    frame?: string;
    frame_effects?: string[];
    full_art?: boolean;
    textless?: boolean;
    booster?: boolean;
    oracle_text?: string;
    printed_name?: string;
    image_uris?: {
        art_crop?: string;
        border_crop?: string;
        large?: string;
        normal?: string;
        png?: string;
        small?: string;
    };
    story_spotlight?: boolean;
    edhrec_rank?: number;
    penny_rank?: number;
    preview?: {
        source?: string;
        source_uri?: string;
        previewed_at?: string;
    };
    prices?: {
        usd?: string | null;
        usd_foil?: string | null;
        usd_etched?: string | null;
        eur?: string | null;
        eur_foil?: string | null;
        tix: string | null;
    };
    related_uris?: {
        gatherer: string;
        tcgplayer_infinite_articles: string;
        tcgplayer_infinite_decks: string;
        edhrec: string;
    };
    purchase_uris?: {
        tcgplayer: string;
        cardmarket: string;
        cardhoarder: string;
    };
}

export interface ScryfallResponse {
    data: CardData[];
    has_more: boolean;
    not_found?: string[];
    object: "list";
    total_cards: number;
}

export const getMultipleCardData = async (
    cardIdentifiers: CardIdentifier[],
    request = promiseWrappedRequest
): Promise<ScryfallResponse> => {
    if (cardIdentifiers.length === 0) {
        return {
            data: [],
            has_more: false,
            object: "list",
            total_cards: 0,
        };
    }

    const postData = JSON.stringify({
        identifiers: cardIdentifiers,
    });

    const params: RequestOptions = {
        url: "https://api.scryfall.com/cards/collection",
        method: "POST",
        body: postData,
        contentType: "application/json",
        throw: false,
        headers: {
            accept: "application/json",
            "user-agent": "obsidian-mtg",
        },
    };

    return request(params);
};

export const fetchCardDataFromScryfall = async (
    distinctCards: CardIdentifier[],
    onProgress?: (fetched: number, total: number) => void
): Promise<Record<string, CardData>> => {
    const uncachedCards = distinctCards.filter(identifier => {
        const key = "name" in identifier
            ? identifier.name
            : `${identifier.set}-${identifier.collector_number}`;
        return !cardDataCache[key];
    });

    if (uncachedCards.length > 0) {
        const batches: CardIdentifier[][] = [];
        let currentBatch: CardIdentifier[] = [];
        batches.push(currentBatch);

        uncachedCards.forEach(identifier => {
            if (currentBatch.length === MAX_SCRYFALL_BATCH_SIZE) {
                batches.push(currentBatch);
                currentBatch = [];
            }
            currentBatch.push(identifier);
        });
        batches.push(currentBatch);

        let fetched = 0;
        const total = distinctCards.length;

        for (const batch of batches) {
            const result = await getMultipleCardData(batch);
            result.data.forEach((card: CardData) => {
                if (card.name) {
                    cardDataCache[nameToId(card.name)] = card;
                }
                if (card.printed_name) {
                    cardDataCache[nameToId(card.printed_name)] = card;
                }
            });
            fetched += batch.length;
            onProgress?.(fetched, total);
        }
    }

    return cardDataCache;
};

/**
 * Fetches card data from the Scryfall API for a list of distinct cards.
 * Cards are fetched in batches of {@link MAX_SCRYFALL_BATCH_SIZE} to respect
 * Scryfall's API limits. All batches are fetched in parallel.
 *
 * The resulting record is indexed by both the card's English name and its
 * printed (localized) name, allowing lookups to work regardless of which
 * name was used in the decklist.
 *
 * @param distinctCards - List of distinct card identifiers to fetch
 * @returns A record of card data indexed by normalized card name
 */
export const fetchFromScryfall = async (
	distinctCards: CardIdentifier[]
): Promise<Record<string, CardData>> => {
	const batches: CardIdentifier[][] = [];
	let currentBatch: CardIdentifier[] = [];
	batches.push(currentBatch);

	distinctCards.forEach((identifier: CardIdentifier) => {
		if (currentBatch.length === MAX_SCRYFALL_BATCH_SIZE) {
			batches.push(currentBatch);
			currentBatch = [];
		}
		currentBatch.push(identifier);
	});

	batches.push(currentBatch);

	const cardDataInBatches: ScryfallResponse[] = await Promise.all(
		batches.map((batch) => getMultipleCardData(batch))
	);

	const cardDataByCardId: Record<string, CardData> = {};

	cardDataInBatches.forEach((batch) => {
		batch.data.forEach((card: CardData) => {
			if (card.name) {
				const cardId = nameToId(card.name);
				cardDataByCardId[cardId] = card;
			}

            if (card.printed_name) {
                const cardId = nameToId(card.printed_name);
                cardDataByCardId[cardId] = card;
            }
		});
	});

	return cardDataByCardId;
};