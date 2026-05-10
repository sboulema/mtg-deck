import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	DEFAULT_COLLECTION_COUNT_COLUMN,
	DEFAULT_COLLECTION_FILE_EXTENSION,
	DEFAULT_COLLECTION_NAME_COLUMN,
	DEFAULT_COLLECTION_SYNC_INTERVAL,
	syncCounts,
} from "src/collection";
import { renderDecklist } from "src/renderer";
import { ObsidianPluginMtgSettings } from "src/settings";
import { CardCounts } from "src/collection";

const DEFAULT_SETTINGS: ObsidianPluginMtgSettings = {
	collection: {
		fileExtension: DEFAULT_COLLECTION_FILE_EXTENSION,
		nameColumn: DEFAULT_COLLECTION_NAME_COLUMN,
		countColumn: DEFAULT_COLLECTION_COUNT_COLUMN,
		syncIntervalMs: DEFAULT_COLLECTION_SYNC_INTERVAL,
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

		vault.on("modify", async (f) => {
			if (f.name.endsWith(".csv")) {
				const settings = this.settings;
				const collectionFileExt =
					settings.collection?.fileExtension || "";
				if (f.name.endsWith(collectionFileExt)) {
					this.cardCounts = await syncCounts(vault, settings);
				}
			}
		});

		this.app.workspace.onLayoutReady(async () => {
			this.cardCounts = await syncCounts(vault, this.settings);
		});

		this.registerMarkdownCodeBlockProcessor(
			"mtg-deck",
			async (source: string, el: HTMLElement, ctx) => {
				// Sync card counts once if they haven't been already
				if (!this.cardCounts) {
					this.cardCounts = await syncCounts(vault, this.settings);
				}

				try {
					await renderDecklist(
						el,
						source,
						this.cardCounts,
						this.settings
					);
				} catch (err) {
					console.error(err);
					el.createDiv({
						text: String(err),
						cls: "obsidian-plugin-mtg-error",
					});
				}
			}
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
			.setName("Collection CSV")
			.setDesc("The file extension of your collection as a CSV file")
			.addText((text) =>
				text
					.setPlaceholder(".mtg.collection.csv")
					.setValue(this.plugin.settings.collection.fileExtension)
					.onChange(async (value) => {
						this.plugin.settings.collection.fileExtension = value;
						await this.plugin.saveSettings();
					})
			);

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