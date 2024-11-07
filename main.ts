import { App, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import { CardView, VIEW_TYPE_CARD } from './cardView';

interface CardViewPluginSettings {
    defaultView: 'card' | 'list' | 'timeline';
}

const DEFAULT_SETTINGS: CardViewPluginSettings = {
    defaultView: 'card'
}

class CardViewSettingTab extends PluginSettingTab {
    plugin: CardViewPlugin;

    constructor(app: App, plugin: CardViewPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('默认视图')
            .setDesc('选择默认的视图模式')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('card', '卡片视图')
                    .addOption('list', '列表视图')
                    .addOption('timeline', '时间轴视图')
                    .setValue(this.plugin.settings.defaultView);
                
                dropdown.onChange(async (value) => {
                    if (value === 'card' || value === 'list' || value === 'timeline') {
                        this.plugin.settings.defaultView = value;
                        await this.plugin.saveSettings();
                    }
                });
                
                return dropdown;
            });
    }
}

export default class CardViewPlugin extends Plugin {
    settings: CardViewPluginSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_CARD,
            (leaf: WorkspaceLeaf) => new CardView(leaf, this)
        );

        this.addRibbonIcon('layout-grid', '卡片视图', () => {
            this.activateView();
        });

        this.addSettingTab(new CardViewSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
        if (!leaf) {
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({
                type: VIEW_TYPE_CARD,
                active: true,
            });
        }
        workspace.revealLeaf(leaf);
    }
} 