import { App, FuzzySuggestModal, Plugin, PluginSettingTab, Setting, TFolder } from "obsidian";
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
import { loadCache, getCache, clearCache } from "src/cache";

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

			const savedData = await this.loadData();
			if (savedData?.collectionHash === hash && savedData?.cardDataCache) {
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
			const data = await this.loadData() ?? {};

			await this.saveData({
				...data,
				settings: this.settings,
				collectionHash: hash,
				cardDataCache: getCache(),
			});
		})();
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data?.settings as Partial<ObsidianPluginMtgSettings>
		);
	}

	async saveSettings() {
		const data = await this.loadData() ?? {};
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

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Collection")
			.setHeading()

		// Collection CSV setting
		new Setting(containerEl)
			.setName("Collection folder")
			.setDesc("Folder containing your collection CSV files")
			.addText((text) => {
				text
					.setPlaceholder("Collections")
					.setValue(this.plugin.settings.collection.folderPath)
					.onChange(async (value) => {
						this.plugin.settings.collection.folderPath = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton((button) => {
				button
    				.setIcon("folder-open")
					.setTooltip("Browse folders")
					.onClick(() => {
						void (async () => {
							new FolderSuggestModal(
								this.app,
								(folder) => {
									void (async () => {
										this.plugin.settings.collection.folderPath =
											folder.path;

										await this.plugin.saveSettings();

										this.display();
									})();
								}
							).open();
						})();
					});
			});

		new Setting(containerEl)
			.setName("Card name column name")
			.setDesc("The name of the CSV column used for card names")
			.addText((text) =>
				text
					.setPlaceholder("Name")
					.setValue(this.plugin.settings.collection.nameColumn)
					.onChange(async (value) => {
						this.plugin.settings.collection.nameColumn = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Card count column name")
			.setDesc("The name of the CSV column used for card counts/quantity")
			.addText((text) =>
				text
					.setPlaceholder("Count")
					.setValue(this.plugin.settings.collection.countColumn)
					.onChange(async (value) => {
						this.plugin.settings.collection.countColumn = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Deck list")
			.setHeading()

		new Setting(containerEl)
			.setName("Preferred currency")
			.setDesc(
				"The currency you prefer when viewing card prices in your decklist"
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("usd", "USD")
					.addOption("eur", "EUR")
					.addOption("tix", "Tix")
					.setValue(this.plugin.settings.decklist.preferredCurrency)
					.onChange(async (value: string) => {
						this.plugin.settings.decklist.preferredCurrency = value as "usd" | "eur" | "tix";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show card name hyperlinks")
			.setDesc(
				"Enables card names that link to Scryfall or purchasing sites when possible"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.decklist.showCardNamesAsHyperlinks
					)
					.onChange(async (value: boolean) => {
						this.plugin.settings.decklist.showCardNamesAsHyperlinks =
							value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show card images")
			.setDesc(
				"Enables card previews when hovering with the mouse on desktop"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.decklist.showCardPreviews)
					.onChange(async (value: boolean) => {
						this.plugin.settings.decklist.showCardPreviews = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show buylist")
			.setDesc(
				"Enables a buylist below your decklist with buylinks for each card"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.decklist.showBuylist)
					.onChange(async (value: boolean) => {
						this.plugin.settings.decklist.showBuylist = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show card prices")
			.setDesc("Enables card prices to be displayed in decklists")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.decklist.showCardPrices)
					.onChange(async (value: boolean) => {
						this.plugin.settings.decklist.showCardPrices = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show card mana costs")
			.setDesc("Enables mana costs to be displayed for each card")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.decklist.showManaCosts)
					.onChange(async (value: boolean) => {
						this.plugin.settings.decklist.showManaCosts = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show card rarities")
			.setDesc("Enables card rarities to be displayed for each card")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.decklist.showCardRarities)
					.onChange(async (value: boolean) => {
						this.plugin.settings.decklist.showCardRarities = value;
						await this.plugin.saveSettings();
					})
			);
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