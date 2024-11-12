import { App, PluginManifest,Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import { CardView, VIEW_TYPE_CARD } from './cardView';

interface CardViewPluginSettings {
    defaultView: 'card' | 'list' | 'timeline' | 'month' | 'week';
    cardWidth: number;
    minCardWidth: number;
    maxCardWidth: number;
    showTagCount: boolean;
    cardHeight: number;
    minCardHeight: number;
    maxCardHeight: number;
}

const DEFAULT_SETTINGS: CardViewPluginSettings = {
    defaultView: 'card',
    cardWidth: 280,
    minCardWidth: 280,
    maxCardWidth: 600,
    showTagCount: false,
    cardHeight: 280,
    minCardHeight: 200,
    maxCardHeight: 800
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
                    .addOption('month', '月视图')
                    .addOption('week', '周视图')
                    .setValue(this.plugin.settings.defaultView);
                
                dropdown.onChange(async (value) => {
                    if (value === 'card' || value === 'list' || value === 'timeline' || value === 'month' || value === 'week') {
                        this.plugin.settings.defaultView = value;
                        await this.plugin.saveSettings();
                    }
                });
            });

        new Setting(containerEl)
            .setName('卡片宽度')
            .setDesc('设置卡片的宽度（280-600像素）')
            .addText(text => text
                .setPlaceholder('280')
                .setValue(this.plugin.settings.cardWidth.toString())
                .onChange(async (value) => {
                    const width = Number(value);
                    if (!isNaN(width) && width >= 280 && width <= 600) {
                        this.plugin.settings.cardWidth = width;
                        await this.plugin.saveSettings();
                        this.plugin.updateAllCardViews();
                    }
                }));

        new Setting(containerEl)
            .setName('最小宽度')
            .setDesc('设置卡片的最小宽度（像素）')
            .addText(text => text
                .setPlaceholder('280')
                .setValue(this.plugin.settings.minCardWidth.toString())
                .onChange(async (value) => {
                    const width = Number(value);
                    if (!isNaN(width) && width >= 200) {
                        this.plugin.settings.minCardWidth = width;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('最大宽度')
            .setDesc('设置卡片的最大宽度（像素）')
            .addText(text => text
                .setPlaceholder('600')
                .setValue(this.plugin.settings.maxCardWidth.toString())
                .onChange(async (value) => {
                    const width = Number(value);
                    if (!isNaN(width) && width <= 800) {
                        this.plugin.settings.maxCardWidth = width;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('显示标签引用数量')
            .setDesc('在标签后显示使用该标签的笔记数量')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTagCount)
                .onChange(async (value) => {
                    this.plugin.settings.showTagCount = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshAllTags();
                }));

        new Setting(containerEl)
            .setName('卡片高度')
            .setDesc('设置卡片的高度（200-800像素）')
            .addText(text => text
                .setPlaceholder('280')
                .setValue(this.plugin.settings.cardHeight.toString())
                .onChange(async (value) => {
                    const height = Number(value);
                    if (!isNaN(height) && height >= 200 && height <= 800) {
                        this.plugin.settings.cardHeight = height;
                        await this.plugin.saveSettings();
                        this.plugin.updateAllCardViews();
                    }
                }));

        new Setting(containerEl)
            .setName('最小高度')
            .setDesc('设置卡片的最小高度（像素）')
            .addText(text => text
                .setPlaceholder('200')
                .setValue(this.plugin.settings.minCardHeight.toString())
                .onChange(async (value) => {
                    const height = Number(value);
                    if (!isNaN(height) && height >= 200) {
                        this.plugin.settings.minCardHeight = height;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('最大高度')
            .setDesc('设置卡片的最大高度（像素）')
            .addText(text => text
                .setPlaceholder('800')
                .setValue(this.plugin.settings.maxCardHeight.toString())
                .onChange(async (value) => {
                    const height = Number(value);
                    if (!isNaN(height) && height <= 800) {
                        this.plugin.settings.maxCardHeight = height;
                        await this.plugin.saveSettings();
                    }
                }));
    }
}

export default class CardViewPlugin extends Plugin {
    settings: CardViewPluginSettings;

    constructor(app: App, manifest: PluginManifest) { // 添加 manifest 参数
        super(app, manifest); // 传递 manifest
        this.settings = DEFAULT_SETTINGS; // 初始化 settings
    }
    
    async onload() {
        // debugger; // 这里会在调试时自动停住
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_CARD,
            (leaf: WorkspaceLeaf) => new CardView(leaf, this)
        );

        this.addRibbonIcon('layout-grid', '卡片视图', () => {
            this.activateView();
        });

        this.addSettingTab(new CardViewSettingTab(this.app, this));

        // 监听文件列表的点击事件
        this.app.workspace.on("file-open", (file: TFile | null) => {
            if (file) {
                this.handleFileOpen(file);
            }
        });

    }

    handleFileOpen(file: TFile) {
        // 处理文件打开事件
        console.log(`文件 ${file.path} 被1打开`);
        // 在这里可以添加您想要的逻辑，例如更新视图或显示相关信息
    }

    handleFolderOpen(folder: string) { // 新增处理文件夹打开的函数
        console.log(`文件夹 ${folder} 被打开`);
        // 在这里可以添加您想要的逻辑，例如更新视图或显示 相关信息
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

    updateAllCardViews() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_CARD).forEach(leaf => {
            const view = leaf.view as CardView;
            if (view) {
                view.updateCardSize(this.settings.cardWidth);
            }
        });
    }

    async saveCardWidth(width: number) {
        this.settings.cardWidth = width;
        await this.saveSettings();
    }

    refreshAllTags() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_CARD).forEach(leaf => {
            const view = leaf.view as CardView;
            if (view) {
                view.refreshTags();
            }
        });
    }

    public async saveCardHeight(height: number) {
        this.settings.cardHeight = height;
        await this.saveSettings();
    }
}