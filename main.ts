import { App, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import { CardView, VIEW_TYPE_CARD } from './cardView';

interface CardViewPluginSettings {
    defaultView: 'card' | 'list' | 'timeline';  // 默认视图模式
}

const DEFAULT_SETTINGS: CardViewPluginSettings = {
    defaultView: 'card'
}

export default class CardViewPlugin extends Plugin {
    settings: CardViewPluginSettings;

    /**
     * 插件加载时的初始化函数
     * 负责注册视图、添加按钮和设置选项
     */
    async onload() {
        await this.loadSettings();

        // 注册卡片视图
        this.registerView(
            VIEW_TYPE_CARD,
            (leaf: WorkspaceLeaf) => new CardView(leaf, this)
        );

        // 在左侧边栏添加图标按钮
        this.addRibbonIcon('cards', '卡片视图', () => {
            this.activateView();
        });

        // 添加插件设置选项
        this.addSettingTab(new CardViewSettingTab(this.app, this));
    }

    /**
     * 加载插件设置
     * 将默认设置与已保存的设置合并
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * 保存插件设置到数据文件
     */
    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * 激活卡片视图
     * 如果视图不存在则创建新视图，否则切换到已存在的视图
     */
    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
        if (!leaf) {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_CARD,
                active: true,
            });
        }
        workspace.revealLeaf(leaf);
    }
} 