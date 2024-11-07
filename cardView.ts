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
    private selectedNotes: Set<string> = new Set();
    private lastSelectedNote: string | null = null;
    private recentFolders: string[] = [];
    private cardSize: number = 280;  // 默认卡片宽度
    private readonly MIN_CARD_SIZE = 280;  // 最小卡片宽度
    private readonly MAX_CARD_SIZE = 600;  // 最大卡片宽度

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
        
        // 创建主布局容器
        const mainLayout = containerEl.createDiv('main-layout');
        
        // 创建左侧内容区域
        const contentSection = mainLayout.createDiv('content-section');
        
        // 创建工具栏
        const toolbar = contentSection.createDiv('card-view-toolbar');
        
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
        this.tagContainer = contentSection.createDiv('tag-filter');
        await this.loadTags();

        // 创建主内容区域
        const contentArea = contentSection.createDiv('card-view-content');
        this.container = contentArea.createDiv('card-container');
        
        // 使用保存的宽度初始化卡片容器
        this.cardSize = this.plugin.settings.cardWidth;
        this.container.style.gridTemplateColumns = `repeat(auto-fill, ${this.cardSize}px)`;

        // 创建预览区域
        const previewWrapper = mainLayout.createDiv('preview-wrapper');
        this.previewContainer = previewWrapper.createDiv('preview-container');
        
        // 添加预览控制按钮
        const previewControls = previewWrapper.createDiv('preview-controls');
        const toggleButton = previewControls.createEl('button', {
            cls: 'preview-toggle',
            attr: { 'aria-label': '折叠预览' }
        });
        toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-right"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        
        toggleButton.addEventListener('click', () => this.togglePreview());

        // 添加调整大小的功能
        this.previewResizer = previewWrapper.createDiv('preview-resizer');
        this.setupResizer();

        // 添加全局滚轮事件监听
        document.addEventListener('wheel', (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                this.adjustCardSize(e.deltaY);
            }
        }, { passive: false });

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

        // 添加所有卡片到容器，并设置正确的宽度
        cards.forEach(card => {
            if (card instanceof HTMLElement) {
                card.style.width = `${this.cardSize}px`;
                this.container.appendChild(card);
            }
        });

        // 确保容器使用正确的网格列宽度
        this.container.style.gridTemplateColumns = `repeat(auto-fill, ${this.cardSize}px)`;
    }

    /**
     * 创建单个笔记卡片
     * @param file - 笔记文件
     * @returns 卡片HTML元素
     */
    private async createNoteCard(file: TFile): Promise<HTMLElement> {
        const card = document.createElement('div');
        card.addClass('note-card');
        card.setAttribute('data-path', file.path);
        
        // 创建卡片头部
        const header = card.createDiv('note-card-header');
        
        // 添加修改时间
        const lastModified = header.createDiv('note-date');
        lastModified.setText(new Date(file.stat.mtime).toLocaleDateString());

        // 修改文件夹路径的创建和样式
        const folderPath = header.createDiv('note-folder');
        const folder = file.parent ? (file.parent.path === '/' ? '根目录' : file.parent.path) : '根目录';
        folderPath.setText(folder);
        folderPath.setAttribute('title', `打开文件夹: ${folder}`);
        
        // 添加点击事件
        folderPath.addEventListener('click', async (e) => {
            e.stopPropagation();
            // 打开文件夹
            const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
            if (fileExplorer) {
                const fileExplorerView = fileExplorer.view as any;
                if (fileExplorerView.expandFolder) {
                    await this.revealFolderInExplorer(folder);
                    // 聚焦到文件浏览器
                    fileExplorer.setEphemeralState({ focus: true });
                }
            }
        });

        // 添加打开按钮
        const openButton = header.createDiv('note-open-button');
        openButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
        openButton.setAttribute('title', '在新标签页中打开');
        openButton.style.opacity = '0';  // 默认隐藏

        // 创建卡片内容容器
        const cardContent = card.createDiv('note-card-content');

        // 处理标题（移到内容区域顶部）
        const title = cardContent.createDiv('note-title');
        let displayTitle = file.basename;
        // 处理日期开头的标题
        const timePattern = /^\d{4}[-./]\d{2}[-./]\d{2}/;
        if (timePattern.test(displayTitle)) {
            displayTitle = displayTitle.replace(timePattern, '').trim();
        }
        title.setText(displayTitle);

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

            // 鼠标悬停事件
            card.addEventListener('mouseenter', async () => {
                openButton.style.opacity = '1';  // 显示打开按钮
                title.style.opacity = '0';
                noteContent.style.display = 'block';
                
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

            card.addEventListener('mouseleave', () => {
                openButton.style.opacity = '0';  // 隐藏打开按钮
                title.style.opacity = '1';
                noteContent.style.display = 'none';
            });

            // 修改事件监听
            openButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                const leaf = this.app.workspace.getLeaf('tab');
                await leaf.openFile(file);
            });

            // 单击选择
            card.addEventListener('click', (e) => {
                this.handleCardSelection(file.path, e);
            });

            // 双击打开
            card.addEventListener('dblclick', async () => {
                const leaf = this.app.workspace.getLeaf('tab');
                await leaf.openFile(file);
            });

            // 右键菜单
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, this.getSelectedFiles());
            });

        } catch (error) {
            console.error('笔记加载失败:', error);
        }

        // 添加卡片悬停事件
        card.addEventListener('mouseenter', async () => {
            openButton.style.opacity = '1';  // 显示打开按钮
            // ... 其他悬停事件代码 ...
        });

        card.addEventListener('mouseleave', () => {
            openButton.style.opacity = '0';  // 隐藏打开按钮
            // ... 其他离开事件代码 ...
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

    // 修改预览栏大小调整方法
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
                // 调整卡片容器的宽度
                this.adjustContentWidth();
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

    // 添加内容区域宽度调整方法
    private adjustContentWidth() {
        const mainLayout = this.containerEl.querySelector('.main-layout');
        const previewWidth = this.previewContainer.offsetWidth;
        const contentSection = this.containerEl.querySelector('.content-section');
        
        if (mainLayout && contentSection) {
            const totalWidth = mainLayout.offsetWidth;
            const newContentWidth = totalWidth - previewWidth - 4; // 4px 是分隔线宽度
            contentSection.style.width = `${newContentWidth}px`;
            
            // 重新计算卡片列数
            const availableWidth = newContentWidth - 32; // 减去内边距
            const columns = Math.floor(availableWidth / this.cardSize);
            const gap = 16; // 卡片间距
            const actualCardWidth = (availableWidth - (columns - 1) * gap) / columns;
            
            this.container.style.gridTemplateColumns = `repeat(${columns}, ${actualCardWidth}px)`;
        }
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
            event.stopPropagation();
            
            // 如果点击的卡片没有被选中，且没有按住 Ctrl 键，
            // 则清除其他选择并选中当前卡片
            const path = card.getAttribute('data-path');
            if (path && !this.selectedNotes.has(path) && !event.ctrlKey) {
                this.clearSelection();
                this.selectedNotes.add(path);
                card.addClass('selected');
            }

            const selectedFiles = this.getSelectedFiles();
            this.showContextMenu(event, selectedFiles);
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

        const cards = await Promise.all(
            filteredFiles.map(file => this.createNoteCard(file))
        );

        cards.forEach(card => {
            if (card instanceof HTMLElement) {
                card.style.width = `${this.cardSize}px`;
                this.container.appendChild(card);
            }
        });

        // 确保容器使用正确的网格列宽度
        this.container.style.gridTemplateColumns = `repeat(auto-fill, ${this.cardSize}px)`;
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

    // 处理卡片选择
    private handleCardSelection(path: string, event: MouseEvent) {
        const card = this.container.querySelector(`[data-path="${path}"]`);
        if (!card) return;

        if (event.ctrlKey) {
            // Ctrl + 点击：切换选择
            if (this.selectedNotes.has(path)) {
                this.selectedNotes.delete(path);
                card.removeClass('selected');
            } else {
                this.selectedNotes.add(path);
                card.addClass('selected');
            }
        } else if (event.shiftKey && this.lastSelectedNote) {
            // Shift + 点击：连续选择
            const cards = Array.from(this.container.querySelectorAll('.note-card'));
            const lastIndex = cards.findIndex(c => c.getAttribute('data-path') === this.lastSelectedNote);
            const currentIndex = cards.findIndex(c => c.getAttribute('data-path') === path);
            
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);

            cards.forEach((c, i) => {
                const cardPath = c.getAttribute('data-path');
                if (i >= start && i <= end && cardPath) {
                    this.selectedNotes.add(cardPath);
                    c.addClass('selected');
                }
            });
        } else {
            // 普通点击：清除其他选择，选中当前
            this.clearSelection();
            this.selectedNotes.add(path);
            card.addClass('selected');
        }

        this.lastSelectedNote = path;
    }

    // 清除所有选择
    private clearSelection() {
        this.selectedNotes.clear();
        this.container.querySelectorAll('.note-card.selected').forEach(card => {
            card.removeClass('selected');
        });
    }

    // 获取选中的文件
    private getSelectedFiles(): TFile[] {
        return Array.from(this.selectedNotes)
            .map(path => this.app.vault.getAbstractFileByPath(path))
            .filter((file): file is TFile => file instanceof TFile);
    }

    // 显示右键菜单
    private showContextMenu(event: MouseEvent, files: TFile[]) {
        const menu = new Menu();

        if (files.length > 0) {
            menu.addItem((item) => {
                item
                    .setTitle(`在新标签页打开`)
                    .setIcon("link")
                    .onClick(async () => {
                        for (const file of files) {
                            const leaf = this.app.workspace.getLeaf('tab');
                            await leaf.openFile(file);
                        }
                    });
            });

            menu.addItem((item) => {
                item
                    .setTitle(`在文件管理器中显示`)
                    .setIcon("folder")
                    .onClick(() => {
                        const file = files[0];  // 显示第一个选中文件的位置
                        this.revealFolderInExplorer(file.parent?.path || '/');
                    });
            });

            menu.addItem((item) => {
                item
                    .setTitle(`移动 ${files.length} 个文件`)
                    .setIcon("move")
                    .onClick(() => {
                        const modal = new EnhancedFileSelectionModal(
                            this.app,
                            files,
                            this.recentFolders,
                            (folders) => {
                                this.recentFolders = folders;
                            }
                        );
                        modal.open();
                    });
            });

            menu.addItem((item) => {
                item
                    .setTitle(`删除 ${files.length} 个文件`)
                    .setIcon("trash")
                    .onClick(async () => {
                        const confirm = await new ConfirmModal(
                            this.app,
                            "确认删除",
                            `是否确定要删除选中的 ${files.length} 个文件？`
                        ).show();

                        if (confirm) {
                            for (const file of files) {
                                await this.app.vault.trash(file, true);
                            }
                            this.refreshView();
                        }
                    });
            });
        }

        menu.showAtMouseEvent(event);
    }

    // 修改调整卡片大小的方法
    private adjustCardSize(delta: number) {
        const adjustment = delta > 0 ? -10 : 10;
        const newSize = Math.max(
            this.plugin.settings.minCardWidth,
            Math.min(this.plugin.settings.maxCardWidth, this.cardSize + adjustment)
        );

        if (newSize !== this.cardSize) {
            this.cardSize = newSize;
            this.updateCardSize(newSize);
            // 保存新的宽度
            this.plugin.saveCardWidth(newSize);
        }
    }

    // 添加更新卡片大小的方法
    public updateCardSize(width: number) {
        this.cardSize = width;
        // 更新所有卡片的宽度
        this.container.querySelectorAll('.note-card').forEach((card: Element) => {
            if (card instanceof HTMLElement) {
                card.style.width = `${width}px`;
            }
        });
        // 更新容器的网格列宽度
        this.container.style.gridTemplateColumns = `repeat(auto-fill, ${width}px)`;
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

// 修改增强的文件选择模态框
class EnhancedFileSelectionModal extends Modal {
    private files: TFile[];
    private recentFolders: string[];
    private onFoldersUpdate: (folders: string[]) => void;
    private selectedFolder: string | null = null;

    constructor(
        app: App,
        files: TFile[],
        recentFolders: string[],
        onFoldersUpdate: (folders: string[]) => void
    ) {
        super(app);
        this.files = files;
        this.recentFolders = recentFolders;
        this.onFoldersUpdate = onFoldersUpdate;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 标题
        contentEl.createEl('h3', { 
            text: `移动 ${this.files.length} 个文件` 
        });

        // 最近使用的文件夹
        if (this.recentFolders.length > 0) {
            const recentSection = contentEl.createDiv('recent-folders-section');
            recentSection.createEl('h4', { text: '最近使用' });
            
            const recentList = recentSection.createDiv('recent-folders-list');
            this.recentFolders.forEach(folder => {
                const item = recentList.createDiv('folder-item recent');
                item.setText(folder);
                item.addEventListener('click', () => this.selectFolder(item, folder));
            });
        }

        // 所有文件夹列表
        const folderList = contentEl.createDiv('folder-list');
        const folders = this.getFoldersWithHierarchy();
        this.createFolderTree(folderList, folders);

        // 添加操作按钮
        const buttonContainer = contentEl.createDiv('modal-button-container');
        
        const confirmButton = buttonContainer.createEl('button', {
            text: '确认移动',
            cls: 'mod-cta'
        });
        confirmButton.addEventListener('click', () => {
            if (this.selectedFolder) {
                this.moveFiles(this.selectedFolder);
            }
        });

        const cancelButton = buttonContainer.createEl('button', {
            text: '取消'
        });
        cancelButton.addEventListener('click', () => this.close());
    }

    private getFoldersWithHierarchy(): FolderItem[] {
        const folders: FolderItem[] = [];
        const seen = new Set<string>();

        this.app.vault.getAllLoadedFiles().forEach(file => {
            if (file instanceof TFolder) {
                const parts = file.path.split('/');
                let currentPath = '';
                let level = 0;

                parts.forEach(part => {
                    if (part) {
                        currentPath += (currentPath ? '/' : '') + part;
                        if (!seen.has(currentPath)) {
                            seen.add(currentPath);
                            folders.push({
                                path: currentPath,
                                name: part,
                                level: level
                            });
                        }
                        level++;
                    }
                });
            }
        });

        return folders.sort((a, b) => a.path.localeCompare(b.path));
    }

    private createFolderTree(container: HTMLElement, folders: FolderItem[]) {
        folders.forEach(folder => {
            const item = container.createDiv({
                cls: 'folder-item'
            });

            // 添加缩进
            item.style.paddingLeft = `${folder.level * 20 + 10}px`;

            // 添加文件夹图标
            const icon = item.createSpan({
                cls: 'folder-icon'
            });
            icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;

            // 添加文件夹名称
            const name = item.createSpan({
                cls: 'folder-name',
                text: folder.name
            });

            item.addEventListener('click', () => this.selectFolder(item, folder.path));
        });
    }

    private selectFolder(element: HTMLElement, path: string) {
        // 移除其他选中状态
        this.contentEl.querySelectorAll('.folder-item').forEach(item => {
            item.removeClass('selected');
        });

        // 添加选中状态
        element.addClass('selected');
        this.selectedFolder = path;
    }

    private async moveFiles(targetFolder: string) {
        const confirmModal = new ConfirmModal(
            this.app,
            "确认移动",
            `是否将选中的 ${this.files.length} 个文件移动到 "${targetFolder}"？`
        );

        if (await confirmModal.show()) {
            for (const file of this.files) {
                const newPath = `${targetFolder}/${file.name}`;
                await this.app.fileManager.renameFile(file, newPath);
            }

            // 更新最近使用的文件夹
            this.recentFolders = [targetFolder, ...this.recentFolders.filter(f => f !== targetFolder)]
                .slice(0, 5);
            this.onFoldersUpdate(this.recentFolders);

            this.close();
        }
    }
}

// 添加文件夹项接口
interface FolderItem {
    path: string;
    name: string;
    level: number;
} 