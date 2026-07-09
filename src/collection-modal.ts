import { App, Modal } from "obsidian";
import { CardCollection, CardCounts } from "./collection";
import { renderCollection } from "./collection-renderer";

export class CollectionModal extends Modal {
    collections: CardCollection[];

    constructor(app: App, collections: CardCollection[]) {
        super(app);
        this.collections = collections;
    }

    onOpen() {
        this.modalEl.addClass("collection-modal");
        void renderCollection(this.contentEl, this.collections);
    }

    onClose() {
        this.contentEl.empty();
    }
}