import { App, FuzzySuggestModal, Plugin, PluginSettingTab, Setting, TFolder, Vault } from "obsidian";
import {
	DEFAULT_COLLECTION_COUNT_COLUMN,
	DEFAULT_COLLECTION_FOLDER_PATH,
	DEFAULT_COLLECTION_NAME_COLUMN,
	syncCounts,
} from "src/collection";
import { renderDecklist } from "src/renderer";
import { ObsidianPluginMtgSettings } from "src/settings";
import { CardCounts } from "src/collection";
import { parseCodeBlockOptions, applyShowOverrides } from "src/code-block-options";

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

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianPluginMtgSettingsTab(this.app, this));

		const { vault } = this.app;

		vault.on("modify", async (file) => {
			if (file.name.endsWith(".csv")) {
				const settings = this.settings;
				const collectionFolderPath =
					settings.collection?.folderPath || "";
				if (file.parent?.path === collectionFolderPath) {
					this.cardCounts = await syncCounts(vault, settings);
				}
			}
		});

		this.app.workspace.onLayoutReady(async () => {
			this.cardCounts = await syncCounts(vault, this.settings);
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
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<ObsidianPluginMtgSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async renderDecklist(vault: Vault, source: string, el: HTMLElement, format: string | null = null) {
		// Sync card counts once if they haven't been already
		if (!this.cardCounts) {
			this.cardCounts = await syncCounts(vault, this.settings);
		}

		try {
			await renderDecklist(
				el,
				source,
				this.cardCounts,
				this.settings,
				format
			);
		} catch (err) {
			console.error(err);
			el.createDiv({
				text: String(err),
				cls: "obsidian-plugin-mtg-error",
			});
		}
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