import {
    ItemView,
    WorkspaceLeaf,
    TFile,
    MarkdownRenderer,
    Menu,
    Modal,
    TFolder,
    App,
    Notice
} from 'obsidian';
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
    private searchInput: HTMLInputElement;
    private currentSearchTerm: string = '';
    private selectedTags: Set<string> = new Set();

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
        
        // 左侧工具组
        const leftTools = toolbar.createDiv('toolbar-left');
        
        // 新建笔记按钮
        const newNoteBtn = leftTools.createEl('button', {
            cls: 'new-note-button',
        });
        newNoteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>新建笔记</span>
        `;
        newNoteBtn.addEventListener('click', () => this.createNewNote());

        // 视图切换按钮组
        const viewSwitcher = leftTools.createDiv('view-switcher');
        this.createViewSwitcher(viewSwitcher);

        // 右侧搜索框
        const searchContainer = toolbar.createDiv('search-container');
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: '搜索笔记...',
            cls: 'search-input'
        });
        
        this.searchInput.addEventListener('input', () => {
            this.currentSearchTerm = this.searchInput.value;
            this.refreshView();
        });

        // 标签栏
        this.tagContainer = containerEl.createDiv('tag-filter');
        await this.loadTags();

        // 主内容区域
        const contentArea = containerEl.createDiv('card-view-content');
        this.container = contentArea.createDiv('card-container');
        
        // 预览区域
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
        
        // 添加 "All" 标签
        const allTagBtn = this.tagContainer.createEl('button', { 
            text: 'All',
            cls: 'tag-btn active'  // 默认选中
        });
        allTagBtn.addEventListener('click', () => {
            this.clearTagSelection();
            allTagBtn.addClass('active');
            this.refreshView();
        });

        // 添加其他标签
        tags.forEach(tag => {
            const tagBtn = this.tagContainer.createEl('button', { 
                text: tag,
                cls: 'tag-btn'
            });
            tagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTag(tag, tagBtn);
            });
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
            { id: 'card', icon: 'grid', text: '卡片视图' },
            { id: 'list', icon: 'list', text: '列表视图' },
            { id: 'timeline', icon: 'clock', text: '时间轴视图' }
        ];
        
        views.forEach(view => {
            const btn = container.createEl('button', {
                cls: `view-switch-btn ${view.id === this.currentView ? 'active' : ''}`,
            });
            
            // 直接使用 SVG 图标
            const iconHtml = {
                'grid': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
                'list': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
                'clock': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
            };
            
            // 创建图
            const iconSpan = btn.createSpan({ cls: 'view-switch-icon' });
            iconSpan.innerHTML = iconHtml[view.icon];
            
            // 添加文字
            btn.createSpan({ text: view.text, cls: 'view-switch-text' });
            
            btn.addEventListener('click', () => {
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

        // 使用 Promise.all 等待所有卡片创建完成
        const cards = await Promise.all(
            files.map(file => this.createNoteCard(file))
        );

        // 添加所有卡片到容器
        cards.forEach(card => {
            this.container.appendChild(card);
        });
    }

    /**
     * 创建单个笔记卡片
     * @param file - 笔记文件
     * @returns 卡片HTML元素
     */
    private async createNoteCard(file: TFile): Promise<HTMLElement> {
        const card = document.createElement('div');
        card.addClass('note-card');
        
        // 创建卡片头部
        const header = card.createDiv('note-card-header');
        
        // 添加修改时间
        const lastModified = header.createDiv('note-date');
        lastModified.setText(new Date(file.stat.mtime).toLocaleDateString());

        // 添加文件夹路径
        const folderPath = header.createDiv('note-folder');
        const folder = file.parent ? (file.parent.path === '/' ? '根目录' : file.parent.path) : '根目录';
        folderPath.setText(folder);
        folderPath.setAttribute('title', folder);

        // 创建卡片内容容器
        const cardContent = card.createDiv('note-card-content');

        try {
            // 读取笔记内容
            const content = await this.app.vault.read(file);
            
            // 创建笔记内容容器
            const noteContent = cardContent.createDiv('note-content');
            
            // 渲染 Markdown 内容
            await MarkdownRenderer.renderMarkdown(
                content,
                noteContent,
                file.path,
                this
            );

            // 处理滚动事件
            noteContent.addEventListener('wheel', (e) => {
                e.stopPropagation();
                const scrollAmount = e.deltaY;
                noteContent.scrollTop += scrollAmount;
            });

            // 添加鼠标悬停事件
            card.addEventListener('mouseenter', async () => {
                // 在预览栏中显示完整内容
                try {
                    this.previewContainer.empty();
                    await MarkdownRenderer.renderMarkdown(
                        content,
                        this.previewContainer,
                        file.path,
                        this
                    );
                } catch (error) {
                    console.error('预览加载失败:', error);
                }
            });

            // 添加点击事件
            card.addEventListener('click', async () => {
                const leaf = this.app.workspace.getLeaf('tab');
                await leaf.openFile(file);
            });

            // 添加右键菜单
            this.addContextMenu(card, file);

        } catch (error) {
            console.error('笔记加载失败:', error);
        }

        return card;
    }

    /**
     * 切换视图模式
     * @param view - 目标视图模式
     */
    private switchView(view: 'card' | 'list' | 'timeline') {
        this.currentView = view;
        this.container.setAttribute('data-view', view);
        this.container.empty();
        
        if (view === 'timeline') {
            this.createTimelineView();
        } else {
            this.loadNotes();
        }
    }

    /**
     * 根据标签过滤笔记
     * @param tag - 标签名称
     */
    private async filterByTag(tag: string) {
        const files = this.app.vault.getMarkdownFiles();
        this.container.empty();

        const filteredFiles = files.filter(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            return cache?.tags?.some(t => t.tag === tag);
        });

        // 使用 Promise.all 等待所有卡片创建完成
        const cards = await Promise.all(
            filteredFiles.map(file => this.createNoteCard(file))
        );

        // 添加所有卡片到容器
        cards.forEach(card => {
            this.container.appendChild(card);
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

    private togglePreview() {
        this.isPreviewCollapsed = !this.isPreviewCollapsed;
        if (this.isPreviewCollapsed) {
            this.previewContainer.addClass('collapsed');
        } else {
            this.previewContainer.removeClass('collapsed');
        }
    }

    private setupResizer() {
        let startX: number;
        let startWidth: number;

        const startResize = (e: MouseEvent) => {
            e.preventDefault();
            startX = e.pageX;
            startWidth = parseInt(getComputedStyle(this.previewContainer).width, 10);
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
            document.body.style.cursor = 'col-resize';
            this.previewResizer.addClass('resizing');
        };

        const resize = (e: MouseEvent) => {
            const width = startWidth - (e.pageX - startX);
            if (width >= 50 && width <= 800) {
                this.previewContainer.style.width = `${width}px`;
                if (this.isPreviewCollapsed) {
                    this.isPreviewCollapsed = false;
                    this.previewContainer.removeClass('collapsed');
                }
            }
        };

        const stopResize = () => {
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
            document.body.style.cursor = '';
            this.previewResizer.removeClass('resizing');
        };

        this.previewResizer.addEventListener('mousedown', startResize);
    }

    private highlightFolder(folder: string) {
        this.currentFolder = this.currentFolder === folder ? null : folder;
        this.container.querySelectorAll('.note-card').forEach(card => {
            const folderElement = card.querySelector('.note-folder');
            const cardFolder = folderElement ? folderElement.textContent : null;
            if (cardFolder) {
                card.toggleClass('folder-highlight', cardFolder === folder);
            }
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

    private async createTimelineView() {
        const timelineContainer = this.container.createDiv('timeline-container');
        
        // 获取所有笔记并按日期分组
        const files = this.app.vault.getMarkdownFiles();
        const notesByDate = new Map<string, TFile[]>();
        
        files.forEach(file => {
            const date = new Date(file.stat.mtime).toLocaleDateString();
            if (!notesByDate.has(date)) {
                notesByDate.set(date, []);
            }
            const notes = notesByDate.get(date);
            if (notes) {
                notes.push(file);
            }
        });

        // 按日期排序
        const sortedDates = Array.from(notesByDate.keys()).sort((a, b) => 
            new Date(b).getTime() - new Date(a).getTime()
        );

        // 创建时间轴
        for (const date of sortedDates) {
            const dateGroup = timelineContainer.createDiv('timeline-date-group');
            
            // 创建日期节点
            const dateNode = dateGroup.createDiv('timeline-date-node');
            dateNode.createDiv('timeline-node-circle');
            dateNode.createDiv('timeline-date-label').setText(date);

            // 创建笔记列表
            const notesList = dateGroup.createDiv('timeline-notes-list');
            const notes = notesByDate.get(date);
            if (notes) {
                for (const file of notes) {
                    const noteItem = notesList.createDiv('timeline-note-item');
                    
                    // 创建标记线
                    noteItem.createDiv('timeline-note-marker');
                    
                    // 创建笔记内容
                    const noteContent = noteItem.createDiv('timeline-note-content');
                    noteContent.createDiv('timeline-note-title').setText(file.basename);
                    
                    // 添加点击事件
                    noteItem.addEventListener('click', async () => {
                        const leaf = this.app.workspace.getLeaf('tab');
                        await leaf.openFile(file);
                    });

                    // 添加预览功能
                    noteItem.addEventListener('mouseenter', async () => {
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
                        }
                    });
                }
            }
        }
    }

    // 添加右键菜单功能
    private addContextMenu(card: HTMLElement, file: TFile) {
        card.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const menu = new Menu(this.app);

            menu.addItem((item) => {
                item
                    .setTitle("在新标签页打开")
                    .setIcon("link")
                    .onClick(async () => {
                        const leaf = this.app.workspace.getLeaf('tab');
                        await leaf.openFile(file);
                    });
            });

            menu.addItem((item) => {
                item
                    .setTitle("在文件管理器中显示")
                    .setIcon("folder")
                    .onClick(() => {
                        this.revealFolderInExplorer(file.parent?.path || '/');
                    });
            });

            menu.addItem((item) => {
                item
                    .setTitle("移动笔记")
                    .setIcon("move")
                    .onClick(async () => {
                        const modal = new FileSelectionModal(this.app, file);
                        modal.open();
                    });
            });

            menu.addItem((item) => {
                item
                    .setTitle("删除笔记")
                    .setIcon("trash")
                    .onClick(async () => {
                        const confirm = await new ConfirmModal(
                            this.app,
                            "确认删除",
                            `是否确定要删除笔记 "${file.basename}"？`
                        ).show();

                        if (confirm) {
                            await this.app.vault.trash(file, true);
                            this.refreshView();
                        }
                    });
            });

            menu.showAtMouseEvent(event);
        });
    }

    // 刷新视图（用于搜索和过滤）
    private async refreshView() {
        const files = this.app.vault.getMarkdownFiles();
        this.container.empty();

        const filteredFiles = files.filter(file => {
            // 搜索过滤
            const matchesSearch = !this.currentSearchTerm || 
                file.basename.toLowerCase().includes(this.currentSearchTerm.toLowerCase());

            // 标签过滤
            let matchesTags = true;
            if (this.selectedTags.size > 0) {
                const cache = this.app.metadataCache.getFileCache(file);
                matchesTags = cache?.tags?.some(t => this.selectedTags.has(t.tag)) ?? false;
            }

            return matchesSearch && matchesTags;
        });

        // 使用 Promise.all 等待所有卡片创建完成
        const cards = await Promise.all(
            filteredFiles.map(file => this.createNoteCard(file))
        );

        // 添加所有卡片到容器
        cards.forEach(card => {
            this.container.appendChild(card);
        });
    }

    // 添加标签切换方法
    private toggleTag(tag: string, tagBtn: HTMLElement) {
        if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
            tagBtn.removeClass('active');
        } else {
            this.selectedTags.add(tag);
            tagBtn.addClass('active');
        }

        // 取消 "All" 标签的选中状态
        const allBtn = this.tagContainer.querySelector('button');
        if (allBtn) {
            allBtn.removeClass('active');
        }

        this.refreshView();
    }

    // 添加清除标签选择方法
    private clearTagSelection() {
        this.selectedTags.clear();
        this.tagContainer.querySelectorAll('.tag-btn').forEach(btn => {
            btn.removeClass('active');
        });
    }
}

// 添加文件选择模态框
class FileSelectionModal extends Modal {
    private file: TFile;

    constructor(app: App, file: TFile) {
        super(app);
        this.file = file;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: '选择目标文件夹' });

        const folderList = contentEl.createDiv('folder-list');
        const folders = this.getFolders();

        folders.forEach(folder => {
            const item = folderList.createDiv('folder-item');
            item.setText(folder);
            item.addEventListener('click', async () => {
                await this.moveFile(folder);
                this.close();
            });
        });
    }

    private getFolders(): string[] {
        const folders = new Set<string>();
        this.app.vault.getAllLoadedFiles().forEach(file => {
            if (file instanceof TFolder) {
                folders.add(file.path);
            }
        });
        return Array.from(folders);
    }

    private async moveFile(targetFolder: string) {
        const newPath = `${targetFolder}/${this.file.name}`;
        await this.app.fileManager.renameFile(this.file, newPath);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 添加确认对话框
class ConfirmModal extends Modal {
    private result: boolean = false;
    private resolvePromise: (value: boolean) => void;
    private title: string;
    private message: string;

    constructor(app: App, title: string, message: string) {
        super(app);
        this.title = title;
        this.message = message;
    }

    async show(): Promise<boolean> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: this.title });
        contentEl.createEl('p', { text: this.message });

        const buttonContainer = contentEl.createDiv('button-container');
        
        const confirmButton = buttonContainer.createEl('button', { text: '确认' });
        confirmButton.addEventListener('click', () => {
            this.result = true;
            this.close();
        });

        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.addEventListener('click', () => {
            this.result = false;
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.resolvePromise(this.result);
    }
} 