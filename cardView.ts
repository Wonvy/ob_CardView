import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer } from 'obsidian';
import CardViewPlugin from './main';

export const VIEW_TYPE_CARD = 'card-view';

export class CardView extends ItemView {
    private plugin: CardViewPlugin;
    private currentView: 'card' | 'list' | 'timeline';
    private container: HTMLElement;
    private tagContainer: HTMLElement;
    private contentContainer: HTMLElement;
    private previewContainer: HTMLElement;

    /**
     * 构造函数
     * @param leaf - 工作区叶子节点
     * @param plugin - 插件实例
     */
    constructor(leaf: WorkspaceLeaf, plugin: CardViewPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentView = plugin.settings.defaultView;
    }

    /**
     * 获取视图类型
     * @returns 视图类型标识符
     */
    getViewType(): string {
        return VIEW_TYPE_CARD;
    }

    /**
     * 获取视图显示文本
     * @returns 显示在标签页上的文本
     */
    getDisplayText(): string {
        return '卡片视图';
    }

    /**
     * 视图打开时的初始化函数
     * 创建标签过滤器、视图切换按钮和容器
     */
    async onOpen() {
        const { containerEl } = this;
        
        this.tagContainer = containerEl.createDiv('tag-filter');
        await this.loadTags();

        const viewSwitcher = containerEl.createDiv('view-switcher');
        this.createViewSwitcher(viewSwitcher);

        this.container = containerEl.createDiv('card-container');
        this.previewContainer = containerEl.createDiv('preview-container');

        await this.loadNotes();
    }

    /**
     * 加载所有标签并创建标签过滤器
     */
    private async loadTags() {
        const tags = this.getAllTags();
        tags.forEach(tag => {
            const tagEl = this.tagContainer.createEl('button', { text: tag });
            tagEl.addEventListener('click', () => this.filterByTag(tag));
        });
    }

    /**
     * 获取所有笔记中的标签
     * @returns 去重后的标签数组
     */
    private getAllTags(): string[] {
        const tags = new Set<string>();
        this.app.vault.getMarkdownFiles().forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.tags) {
                cache.tags.forEach(tag => tags.add(tag.tag));
            }
        });
        return Array.from(tags);
    }

    /**
     * 创建视图切换按钮
     * @param container - 按钮容器元素
     */
    private createViewSwitcher(container: HTMLElement) {
        const views = ['card', 'list', 'timeline'];
        views.forEach(view => {
            const btn = container.createEl('button', { text: view });
            btn.addEventListener('click', () => this.switchView(view as any));
        });
    }

    /**
     * 加载所有笔记并创建卡片
     */
    private async loadNotes() {
        const files = this.app.vault.getMarkdownFiles();
        this.container.empty();

        files.forEach(file => {
            const card = this.createNoteCard(file);
            this.container.appendChild(card);
        });
    }

    /**
     * 创建单个笔记卡片
     * @param file - 笔记文件
     * @returns 卡片HTML元素
     */
    private createNoteCard(file: TFile): HTMLElement {
        const card = document.createElement('div');
        card.addClass('note-card');
        
        const title = card.createDiv('note-title');
        title.setText(file.basename);

        // 添加预览功能
        card.addEventListener('mouseenter', async () => {
            this.previewContainer.empty();
            const content = await this.app.vault.read(file);
            await MarkdownRenderer.renderMarkdown(
                content,
                this.previewContainer,
                file.path,
                this
            );
        });

        return card;
    }

    /**
     * 切换视图模式
     * @param view - 目标视图模式
     */
    private switchView(view: 'card' | 'list' | 'timeline') {
        this.currentView = view;
        this.container.setAttribute('data-view', view);
        this.loadNotes();
    }

    /**
     * 根据标签过滤笔记
     * @param tag - 标签名称
     */
    private filterByTag(tag: string) {
        // 实现标签过滤逻辑
    }
} 