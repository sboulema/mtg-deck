import { App, FuzzySuggestModal, Plugin, PluginSettingTab, Setting, SettingGroup, TFolder } from "obsidian";
import {
    CardCollection,
    CardCounts,
    DEFAULT_COLLECTION_COUNT_COLUMN,
    DEFAULT_COLLECTION_FOLDER_PATH,
    DEFAULT_COLLECTION_NAME_COLUMN,
    hashCollectionContents,
    mergeCollections,
    syncCollections,
} from "src/collection";
import { renderDecklist } from "src/renderer";
import { ObsidianPluginMtgSettings } from "src/settings";
import { parseCodeBlockOptions, applyShowOverrides } from "src/code-block-options";
import { CollectionModal } from "src/collection-modal";
import { renderCollection } from "src/collection-renderer";
import { loadCache, getCache, clearCache, CachedCardData } from "src/cache";

const DEFAULT_SETTINGS: ObsidianPluginMtgSettings = {
	collection: {
		folderPath: DEFAULT_COLLECTION_FOLDER_PATH,
		nameColumn: DEFAULT_COLLECTION_NAME_COLUMN,
		countColumn: DEFAULT_COLLECTION_COUNT_COLUMN,
	},
	decklist: {
		preferredCurrency: "usd",
		showCardNamesAsHyperlinks: true,
		showCardPreviews: true,
		showBuylist: true,
		showCardPrices: true,
		showManaCosts: true,
		showCardRarities: true,
	},
};

interface PluginData {
    settings?: Partial<ObsidianPluginMtgSettings>;
    collectionHash?: string;
    cardDataCache?: Record<string, CachedCardData>;
}

const loadPluginData = async (plugin: Plugin): Promise<PluginData> => {
    return (await plugin.loadData() as PluginData) ?? {};
};

export default class ObsidianPluginMtg extends Plugin {
	settings: ObsidianPluginMtgSettings;

	// This keeps a record of the collection in memory
	cardCounts: CardCounts;
	collections: CardCollection[] = [];

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianPluginMtgSettingsTab(this.app, this));

		const { vault } = this.app;

		vault.on("modify", async (file) => {
			if (file.name.endsWith(".csv")) {
				const collectionFolderPath = this.settings.collection?.folderPath || "";
				if (file.parent?.path.startsWith(collectionFolderPath)) {
					this.collections = await syncCollections(vault, this.settings);
					this.cardCounts = mergeCollections(this.collections);
					clearCache();
				}
			}
		});

		this.app.workspace.onLayoutReady(async () => {
			this.collections = await syncCollections(vault, this.settings);
			this.cardCounts = mergeCollections(this.collections);

			const hash = hashCollectionContents(this.collections);

			const savedData = await loadPluginData(this);
			if (savedData.collectionHash === hash && savedData.cardDataCache) {
				loadCache(savedData.cardDataCache);
			}
		});

		this.addCommand({
			id: "view-collection",
			name: "View collection",
			callback: () => {
				new CollectionModal(this.app, this.collections).open();
			},
		});

		this.registerMarkdownPostProcessor((element) => {
			void (async () => {
				const codeBlocks = element.querySelectorAll("code[class*='language-mtg-deck']");

				for (const codeBlock of Array.from(codeBlocks)) {
					const className = Array.from(codeBlock.classList)
						.find(cls => cls.startsWith("language-mtg-deck")) ?? "";

					const infoString = className.replace("language-", "");
					const { format, showOverrides } = parseCodeBlockOptions(infoString);
					const effectiveSettings = applyShowOverrides(this.settings, showOverrides);

					const source = codeBlock.textContent ?? "";
					const pre = codeBlock.parentElement;

					if (pre) {
						const container = createDiv();
						pre.replaceWith(container);
						await renderDecklist(container, source, this.cardCounts, effectiveSettings, format);
					}
				}
			})();
		});

		this.registerMarkdownCodeBlockProcessor(
			"mtg-collection",
			(_source, el) => {
				void renderCollection(el, this.collections);
			}
		);
	}

	onunload() {
		void (async () => {
			const hash = hashCollectionContents(this.collections);
			const data = await loadPluginData(this);

			await this.saveData({
				...data,
				settings: this.settings,
				collectionHash: hash,
				cardDataCache: getCache(),
			});
		})();
	}

	async loadSettings() {
		const data = await loadPluginData(this);
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data.settings
		);
	}

	async saveSettings() {
		const data = await loadPluginData(this);
		await this.saveData({
			...data,
			settings: this.settings,
		});
	}
}

class ObsidianPluginMtgSettingsTab extends PluginSettingTab {
	plugin: ObsidianPluginMtg;

	constructor(app: App, plugin: ObsidianPluginMtg) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override getControlValue(key: string): unknown {
		switch (key) {
			case "collection.nameColumn":
				return this.plugin.settings.collection.nameColumn;
			case "collection.countColumn":
				return this.plugin.settings.collection.countColumn;
			case "decklist.preferredCurrency":
				return this.plugin.settings.decklist.preferredCurrency;
			case "decklist.showCardNamesAsHyperlinks":
				return this.plugin.settings.decklist.showCardNamesAsHyperlinks;
			case "decklist.showCardPreviews":
				return this.plugin.settings.decklist.showCardPreviews;
			case "decklist.showBuylist":
				return this.plugin.settings.decklist.showBuylist;
			case "decklist.showCardPrices":
				return this.plugin.settings.decklist.showCardPrices;
			case "decklist.showManaCosts":
				return this.plugin.settings.decklist.showManaCosts;
			case "decklist.showCardRarities":
				return this.plugin.settings.decklist.showCardRarities;
			default:
				return undefined;
		}
	}

	override setControlValue(
		key: string,
		value: unknown
	): void | Promise<void> {
		switch (key) {
			case "collection.nameColumn":
				this.plugin.settings.collection.nameColumn = String(value);
				break;
			case "collection.countColumn":
				this.plugin.settings.collection.countColumn = String(value);
				break;
			case "decklist.preferredCurrency":
				this.plugin.settings.decklist.preferredCurrency =
					value as "usd" | "eur" | "tix";
				break;
			case "decklist.showCardNamesAsHyperlinks":
				this.plugin.settings.decklist.showCardNamesAsHyperlinks =
					Boolean(value);
				break;
			case "decklist.showCardPreviews":
				this.plugin.settings.decklist.showCardPreviews = Boolean(value);
				break;
			case "decklist.showBuylist":
				this.plugin.settings.decklist.showBuylist = Boolean(value);
				break;
			case "decklist.showCardPrices":
				this.plugin.settings.decklist.showCardPrices = Boolean(value);
				break;
			case "decklist.showManaCosts":
				this.plugin.settings.decklist.showManaCosts = Boolean(value);
				break;
			case "decklist.showCardRarities":
				this.plugin.settings.decklist.showCardRarities = Boolean(value);
				break;
			default:
				return;
		}

		return this.plugin.saveSettings();
	}

	override getSettingDefinitions() {
		return [
			{
				type: "group" as const,
				heading: "Collection",
				items: [
					{
						name: "Collection folder",
						desc: "Folder containing your collection CSV files",
						render: (setting: Setting, _group: SettingGroup) => {
							setting
								.setName("Collection folder")
								.setDesc(
									"Folder containing your collection CSV files"
								)
								.addText((text) =>
									text
										.setPlaceholder("Collections")
										.setValue(
											this.plugin.settings.collection
												.folderPath
										)
										.onChange(async (value) => {
											this.plugin.settings.collection.folderPath =
												value;
											await this.plugin.saveSettings();
										})
								)
								.addButton((button) => {
									button
										.setIcon("folder-open")
										.setTooltip("Browse folders")
										.onClick(() => {
											new FolderSuggestModal(
												this.app,
												(folder) => {
													this.plugin.settings.collection.folderPath =
														folder.path;
													void this.plugin.saveSettings();
													this.update();
												}
											).open();
										});
								});
						},
					},
					{
						name: "Card name column name",
						desc: "The name of the CSV column used for card names",
						control: {
							type: "text" as const,
							key: "collection.nameColumn",
							placeholder: "Name",
						},
					},
					{
						name: "Card count column name",
						desc: "The name of the CSV column used for card counts/quantity",
						control: {
							type: "text" as const,
							key: "collection.countColumn",
							placeholder: "Count",
						},
					},
				],
			},
			{
				type: "group" as const,
				heading: "Deck list",
				items: [
					{
						name: "Preferred currency",
						desc: "The currency you prefer when viewing card prices in your decklist",
						control: {
							type: "dropdown" as const,
							key: "decklist.preferredCurrency",
							options: {
								usd: "USD",
								eur: "EUR",
								tix: "Tix",
							},
						},
					},
					{
						name: "Show card name hyperlinks",
						desc: "Enables card names that link to Scryfall or purchasing sites when possible",
						control: {
							type: "toggle" as const,
							key: "decklist.showCardNamesAsHyperlinks",
						},
					},
					{
						name: "Show card images",
						desc: "Enables card previews when hovering with the mouse on desktop",
						control: {
							type: "toggle" as const,
							key: "decklist.showCardPreviews",
						},
					},
					{
						name: "Show buylist",
						desc: "Enables a buylist below your decklist with buylinks for each card",
						control: {
							type: "toggle" as const,
							key: "decklist.showBuylist",
						},
					},
					{
						name: "Show card prices",
						desc: "Enables card prices to be displayed in decklists",
						control: {
							type: "toggle" as const,
							key: "decklist.showCardPrices",
						},
					},
					{
						name: "Show card mana costs",
						desc: "Enables mana costs to be displayed for each card",
						control: {
							type: "toggle" as const,
							key: "decklist.showManaCosts",
						},
					},
					{
						name: "Show card rarities",
						desc: "Enables card rarities to be displayed for each card",
						control: {
							type: "toggle" as const,
							key: "decklist.showCardRarities",
						},
					},
				],
			},
		];
	}
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
    private onChoose: (folder: TFolder) => void;

    constructor(app: App, onChoose: (folder: TFolder) => void) {
        super(app);
        this.onChoose = onChoose;
    }

	getItems(): TFolder[] {
		const folders = new Map<string, TFolder>();

		this.app.vault.getFiles().forEach((file) => {
			if (file.extension === "csv" && file.parent) {
				folders.set(file.parent.path, file.parent);

				if (file.parent.parent) {
					folders.set(file.parent.parent.path, file.parent.parent);
				}
			}
		});

		return Array.from(folders.values());
	}

    getItemText(folder: TFolder): string {
        return folder.path;
    }

    onChooseItem(folder: TFolder): void {
        this.onChoose(folder);
        this.close();
    }
}