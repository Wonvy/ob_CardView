"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const cardView_1 = require("./cardView");
const DEFAULT_SETTINGS = {
    defaultView: 'card',
    cardWidth: 280,
    minCardWidth: 280,
    maxCardWidth: 600
};
class CardViewSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian_1.Setting(containerEl)
            .setName('默认视图')
            .setDesc('选择默认的视图1模式')
            .addDropdown(dropdown => {
            dropdown
                .addOption('card', '卡片视图')
                .addOption('list', '列表视图')
                .addOption('timeline', '时间轴视图')
                .setValue(this.plugin.settings.defaultView);
            dropdown.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                if (value === 'card' || value === 'list' || value === 'timeline') {
                    this.plugin.settings.defaultView = value;
                    yield this.plugin.saveSettings();
                }
            }));
        });
        new obsidian_1.Setting(containerEl)
            .setName('卡片宽度')
            .setDesc('设置卡片的宽度（280-600像素）')
            .addText(text => text
            .setPlaceholder('280')
            .setValue(this.plugin.settings.cardWidth.toString())
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            const width = Number(value);
            if (!isNaN(width) && width >= 280 && width <= 600) {
                this.plugin.settings.cardWidth = width;
                yield this.plugin.saveSettings();
                this.plugin.updateAllCardViews();
            }
        })));
        new obsidian_1.Setting(containerEl)
            .setName('最小宽度')
            .setDesc('设置卡片的最小宽度（像素）')
            .addText(text => text
            .setPlaceholder('280')
            .setValue(this.plugin.settings.minCardWidth.toString())
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            const width = Number(value);
            if (!isNaN(width) && width >= 200) {
                this.plugin.settings.minCardWidth = width;
                yield this.plugin.saveSettings();
            }
        })));
        new obsidian_1.Setting(containerEl)
            .setName('最大宽度')
            .setDesc('设置卡片的最大宽度（像素）')
            .addText(text => text
            .setPlaceholder('600')
            .setValue(this.plugin.settings.maxCardWidth.toString())
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            const width = Number(value);
            if (!isNaN(width) && width <= 800) {
                this.plugin.settings.maxCardWidth = width;
                yield this.plugin.saveSettings();
            }
        })));
    }
}
class CardViewPlugin extends obsidian_1.Plugin {
    constructor(app, manifest) {
        super(app, manifest); // 传递 manifest
        this.settings = DEFAULT_SETTINGS; // 初始化 settings
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            this.registerView(cardView_1.VIEW_TYPE_CARD, (leaf) => new cardView_1.CardView(leaf, this));
            this.addRibbonIcon('layout-grid', '卡片视图', () => {
                this.activateView();
            });
            this.addSettingTab(new CardViewSettingTab(this.app, this));
            // 监听文件列表的点击事件
            this.app.workspace.on("file-open", (file) => {
                if (file) {
                    this.handleFileOpen(file);
                }
            });
        });
    }
    handleFileOpen(file) {
        // 处理文件打开事件
        console.log(`文件 ${file.path} 被1打开`);
        // 在这里可以添加您想要的逻辑，例如更新视图或显示相关信息
    }
    handleFolderOpen(folder) {
        console.log(`文件夹 ${folder} 被打开`);
        // 在这里可以添加您想要的逻辑，例如更新视图或显示 相关信息
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
    activateView() {
        return __awaiter(this, void 0, void 0, function* () {
            const { workspace } = this.app;
            let leaf = workspace.getLeavesOfType(cardView_1.VIEW_TYPE_CARD)[0];
            if (!leaf) {
                leaf = workspace.getLeaf('tab');
                yield leaf.setViewState({
                    type: cardView_1.VIEW_TYPE_CARD,
                    active: true,
                });
            }
            workspace.revealLeaf(leaf);
        });
    }
    updateAllCardViews() {
        this.app.workspace.getLeavesOfType(cardView_1.VIEW_TYPE_CARD).forEach(leaf => {
            const view = leaf.view;
            if (view) {
                view.updateCardSize(this.settings.cardWidth);
            }
        });
    }
    saveCardWidth(width) {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings.cardWidth = width;
            yield this.saveSettings();
        });
    }
}
exports.default = CardViewPlugin;
