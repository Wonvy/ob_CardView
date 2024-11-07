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
    private previewResizer: HTMLElement;
    private isPreviewCollapsed: boolean = false;
    private currentFolder: string | null = null;

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
        containerEl.empty();
        containerEl.addClass('card-view-container');
        
        // 创建工具栏
        const toolbar = containerEl.createDiv('card-view-toolbar');
        
        // 创建工具栏左侧区域
        const leftTools = toolbar.createDiv('toolbar-left');
        
        // 新建笔记按钮
        const newNoteBtn = leftTools.createEl('button', {
            cls: 'new-note-button',
        });
        // 添加新建笔记按钮的图标和文本
        newNoteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>新建笔记</span>
        `;
        newNoteBtn.addEventListener('click', () => this.createNewNote());

        // 视图切换按钮组
        const viewSwitcher = leftTools.createDiv('view-switcher');
        this.createViewSwitcher(viewSwitcher);
        
        // 创建工具栏右侧区域（标签过滤器）
        this.tagContainer = toolbar.createDiv('tag-filter');
        await this.loadTags();

        // 创建主内容区域
        const contentArea = containerEl.createDiv('card-view-content');
        this.container = contentArea.createDiv('card-container');
        
        // 创建预览区域
        const previewWrapper = containerEl.createDiv('preview-wrapper');
        this.previewContainer = previewWrapper.createDiv('preview-container');
        
        // 预览控制按钮
        const previewControls = previewWrapper.createDiv('preview-controls');
        const toggleButton = previewControls.createEl('button', {
            cls: 'preview-toggle',
            attr: { 'aria-label': '折叠预览' }
        });
        toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-right"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        
        toggleButton.addEventListener('click', () => this.togglePreview());

        this.previewResizer = previewWrapper.createDiv('preview-resizer');
        this.setupResizer();

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
        const views = [
            { id: 'card', icon: 'grid-2x2', text: '卡片视图' },
            { id: 'list', icon: 'list', text: '列表视图' },
            { id: 'timeline', icon: 'clock', text: '时间轴视图' }
        ];
        
        views.forEach(view => {
            const btn = container.createEl('button', {
                cls: `view-switch-btn ${view.id === this.currentView ? 'active' : ''}`,
                attr: { 'aria-label': view.text }
            });
            
            // 添加图标
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide ${view.icon}"></svg>`;
            
            btn.addEventListener('click', () => {
                // 移除其他按钮的活动状态
                container.querySelectorAll('.view-switch-btn').forEach(b => b.removeClass('active'));
                btn.addClass('active');
                this.switchView(view.id as 'card' | 'list' | 'timeline');
            });
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

        const lastModified = card.createDiv('note-date');
        lastModified.setText(new Date(file.stat.mtime).toLocaleDateString());

        // 添加文件夹路径
        const folderPath = card.createDiv('note-folder');
        const folder = file.parent.path === '/' ? '根目录' : file.parent.path;
        folderPath.setText(folder);
        folderPath.setAttribute('title', folder);
        
        // 点击文件夹路径高亮相同文件夹的笔记
        folderPath.addEventListener('click', (e) => {
            e.stopPropagation();
            this.highlightFolder(folder);
            // 在文件浏览器中定位并展开文件夹
            this.revealFolderInExplorer(folder);
        });

        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.tags) {
            const tagContainer = card.createDiv('note-tags');
            cache.tags.forEach(tag => {
                const tagEl = tagContainer.createEl('span', {
                    text: tag.tag,
                    cls: 'note-tag'
                });
            });
        }

        // 修改卡片点击事件
        card.addEventListener('click', async () => {
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(file);
        });

        // 预览功能保持不变
        card.addEventListener('mouseenter', async () => {
            try {
                this.previewContainer.empty();
                const content = await this.app.vault.read(file);
                await MarkdownRenderer.renderMarkdown(
                    content,
                    this.previewContainer,
                    file.path,
                    this
                );
            } catch (error) {
                console.error('预览加载失败:', error);
                this.previewContainer.setText('预览加载失败');
            }
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
        const files = this.app.vault.getMarkdownFiles();
        this.container.empty();

        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.tags && cache.tags.some(t => t.tag === tag)) {
                const card = this.createNoteCard(file);
                this.container.appendChild(card);
            }
        });

        // 高亮选中的标签
        this.tagContainer.querySelectorAll('button').forEach(btn => {
            if (btn.textContent === tag) {
                btn.addClass('active-tag');
            } else {
                btn.removeClass('active-tag');
            }
        });
    }

    private setupResizer() {
        let startX: number;
        let startWidth: number;

        const startResize = (e: MouseEvent) => {
            startX = e.pageX;
            startWidth = parseInt(getComputedStyle(this.previewContainer).width, 10);
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        };

        const resize = (e: MouseEvent) => {
            const width = startWidth - (e.pageX - startX);
            if (width >= 50) {
                this.previewContainer.style.width = `${width}px`;
                if (this.isPreviewCollapsed) {
                    this.isPreviewCollapsed = false;
                    this.previewContainer.removeClass('collapsed');
                }
            } else if (!this.isPreviewCollapsed) {
                this.isPreviewCollapsed = true;
                this.previewContainer.addClass('collapsed');
            }
        };

        const stopResize = () => {
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
        };

        this.previewResizer.addEventListener('mousedown', startResize);
    }

    private togglePreview() {
        this.isPreviewCollapsed = !this.isPreviewCollapsed;
        this.previewContainer.toggleClass('collapsed');
    }

    private highlightFolder(folder: string) {
        this.currentFolder = this.currentFolder === folder ? null : folder;
        this.container.querySelectorAll('.note-card').forEach(card => {
            const cardFolder = card.querySelector('.note-folder').textContent;
            card.toggleClass('folder-highlight', cardFolder === folder);
        });
    }

    private async revealFolderInExplorer(folder: string) {
        // 获取文件浏览器视图
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (fileExplorer) {
            const fileExplorerView = fileExplorer.view as any;
            
            // 如果是根目录，直接展开根目录
            if (folder === '根目录') {
                if (fileExplorerView.expandFolder) {
                    await fileExplorerView.expandFolder('/');
                }
                return;
            }

            // 展开并选中文件夹
            if (fileExplorerView.expandFolder) {
                // 展开父文件夹路
                const folderParts = folder.split('/');
                let currentPath = '';
                
                // 逐级展开文件夹
                for (const part of folderParts) {
                    currentPath += (currentPath ? '/' : '') + part;
                    await fileExplorerView.expandFolder(currentPath);
                }

                // 选中目标文件夹
                if (fileExplorerView.setSelection) {
                    await fileExplorerView.setSelection(folder);
                }
            }
        }
    }

    private async createNewNote() {
        // 获取当前日期作为默认文件名
        const date = new Date();
        const fileName = `未命名笔记 ${date.toLocaleString().replace(/[/:]/g, '-')}`;
        
        try {
            // 创建新笔记
            const file = await this.app.vault.create(
                `${fileName}.md`,
                '# ' + fileName + '\n\n'
            );
            
            // 在新标签页中打开笔记
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(file);
            
            // 刷新卡片视图
            this.loadNotes();
        } catch (error) {
            console.error('创建笔记失败:', error);
        }
    }
} 