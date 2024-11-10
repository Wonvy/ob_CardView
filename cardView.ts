import {
    ItemView,
    WorkspaceLeaf,
    TFile,
    MarkdownRenderer,
    Menu,
    Modal,
    TFolder,
    App,
    Notice,
} from 'obsidian';
import CardViewPlugin from './main';

export const VIEW_TYPE_CARD = 'card-view';

export class CardView extends ItemView {
    private plugin: CardViewPlugin;
    private currentView: 'card' | 'list' | 'timeline' | 'month';
    private container: HTMLElement = createDiv();  
    private tagContainer: HTMLElement = createDiv();    
    private previewContainer: HTMLElement = createDiv();  
    private previewResizer: HTMLElement = createDiv();  
    private isPreviewCollapsed: boolean = false;
    private searchInput: HTMLInputElement = createEl('input');  
    private currentSearchTerm: string = '';
    private selectedTags: Set<string> = new Set();
    private selectedNotes: Set<string> = new Set();
    private lastSelectedNote: string | null = null;
    private recentFolders: string[] = [];
    private cardSize: number = 280;  // 默认卡片宽度
    private calendarContainer: HTMLElement = createDiv();
    private isCalendarVisible: boolean = false;
    private currentDate: Date = new Date();
    private currentFilter: { type: 'date' | 'none', value?: string } = { type: 'none' };
    private monthViewContainer: HTMLElement = createDiv();
    private isMonthViewVisible: boolean = false;

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

        // 添加日历按钮 - 在视图切换按钮之前添加
        this.createCalendarButton(leftTools);

        // 视图切换按钮组
        const viewSwitcher = leftTools.createDiv('view-switcher');
        this.createViewSwitcher(viewSwitcher);

        // 右侧搜索框
        const searchContainer = toolbar.createDiv('search-container');
        
        // 添加命令按钮（在搜索框之前）
        this.createCommandButton(searchContainer);
        
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: '搜索笔记...',
            cls: 'search-input'
        });
        
        // 初始化搜索处理
        this.setupSearch();

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

        // 初始化日历容器
        this.calendarContainer = createDiv();
        this.calendarContainer.addClass('calendar-container');
        this.calendarContainer.style.display = 'none';
        
        // 将日历容器添加到主布局中
        const mainLayoutElement = containerEl.querySelector('.main-layout');  // 修改变量名
        if (mainLayoutElement) {
            mainLayoutElement.insertBefore(this.calendarContainer, mainLayoutElement.firstChild);
        }

        // 在卡片容器的事件处理中添加
        const cardContainer = containerEl.querySelector('.card-container');
        if (cardContainer) {
            cardContainer.addEventListener('click', (e) => {
                // 如果点击的是容器本身(而不是卡片)
                if (e.target === cardContainer) {
                    // 移除所有卡片的selected类
                    const cards = cardContainer.querySelectorAll('.note-card');
                    cards.forEach(card => {
                        card.classList.remove('selected');
                    });
                } // 这里添加了缺失的闭合括号
            });
        }
    }

    /**
     * 获取所有笔记中的标签
     * @returns 去重后的标签组
     */
    private getAllTags(): string[] {
        const tags = new Set<string>();
        this.app.vault.getMarkdownFiles().forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.tags) { // 如果存在标签
                cache.tags.forEach(tag => tags.add(tag.tag));// 添加标签
            }
        });
        return Array.from(tags);
    }

    private getTagsWithCount(): Map<string, number> {
        const tagCounts = new Map<string, number>();
        
        this.app.vault.getMarkdownFiles().forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.tags) {
                cache.tags.forEach(tag => {
                    const count = tagCounts.get(tag.tag) || 0;
                    tagCounts.set(tag.tag, count + 1);
                });
            }
        });
        
        return tagCounts;
    }

    /**
     * 加载所有标签并创建标签过滤器
     */
    private async loadTags() {
        const tagCounts = this.getTagsWithCount();
        this.tagContainer.empty();

        // 添加 "All" 标签
        const allTagBtn = this.tagContainer.createEl('button', {
            text: this.plugin.settings.showTagCount ? 
                `All ${this.app.vault.getMarkdownFiles().length}` : 'All',
            cls: 'tag-btn active'
        });
        
        allTagBtn.addEventListener('click', () => {
            this.clearTagSelection();
            allTagBtn.addClass('active');
            this.refreshView();
        });

        // 添加其他标签
        Array.from(tagCounts.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([tag, count]) => {
                const tagBtn = this.tagContainer.createEl('button', { 
                    cls: 'tag-btn'
                });
                
                // 创建标签文本
                const tagText = tagBtn.createSpan({
                    text: tag
                });
                
                // 如果需要显示数量,添加数量标签
                if (this.plugin.settings.showTagCount) {
                    tagBtn.createSpan({
                        text: count.toString(),
                        cls: 'tag-count'
                    });
                }
                
                tagBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleTag(tag, tagBtn);
                });
            });
    }

    /**
     * 创建视图切换按钮
     * @param container - 按钮容器元素
     */
    private createViewSwitcher(container: HTMLElement) {
        const views = [
            { id: 'card', icon: 'grid', text: '卡片视图' },
            { id: 'list', icon: 'list', text: '列表视图' },
            { id: 'timeline', icon: 'clock', text: '时间轴视图' },
            { id: 'month', icon: 'calendar', text: '月视图' }
        ];
        
        views.forEach(view => {
            const btn = container.createEl('button', {
                cls: `view-switch-btn ${view.id === this.currentView ? 'active' : ''}`,
            });
            
            // 直接 SVG 图标
            const iconHtml = {
                'grid': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
                'list': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
                'clock': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
                'calendar': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
            };
            
            // 创建图
            const iconSpan = btn.createSpan({ cls: 'view-switch-icon' });
            iconSpan.innerHTML = iconHtml[view.icon as keyof typeof iconHtml];  // 明确类型
            
            // 添加文字
            btn.createSpan({ text: view.text, cls: 'view-switch-text' });
            
            btn.addEventListener('click', () => {
                container.querySelectorAll('.view-switch-btn').forEach(b => b.removeClass('active'));
                btn.addClass('active');
                this.switchView(view.id as 'card' | 'list' | 'timeline' | 'month');
            });
        });
    }

    // 加载所有笔记并创建卡片
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
        
        // 添加修改
        const lastModified = header.createDiv('note-date');
        lastModified.setText(new Date(file.stat.mtime).toLocaleDateString());

        // 修改文件夹路径的创建和样式
        const folderPath = header.createDiv('note-folder');
        const folder = file.parent ? (file.parent.path === '/' ? '根目录' : file.parent.path) : '根目录';
        folderPath.setText(folder);
        folderPath.setAttribute('title', `打开文件夹: ${folder}`);
        folderPath.addClass('clickable');
        
        // 添加点击事件
        folderPath.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // 获取文件浏览器视图
            const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
            if (fileExplorer && fileExplorer.view) {
                // 使用 revealInFolder 方法显示文件夹
                await (fileExplorer.view as any).revealInFolder(file.parent);
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
        
        // 高亮标题中的搜索词
        if (this.currentSearchTerm) {
            title.innerHTML = this.highlightText(displayTitle, this.currentSearchTerm);
        } else {
            title.setText(displayTitle);
        }

        
        try {
            // 读取笔记内容
            const content = await this.app.vault.read(file);
            
            // 创建笔记内容容器
            const noteContent = cardContent.createDiv('note-content');
            
            // 如果有搜索词，先处内容中的搜索词高亮
            if (this.currentSearchTerm) {
                // 将 Markdown 转换为 HTML
                await MarkdownRenderer.render(
                    this.app,
                    content,
                    noteContent,
                    file.path,
                    this
                );
                
                // 高亮搜索词
                const contentElements = noteContent.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
                contentElements.forEach(element => {
                    const originalText = element.textContent || '';
                    if (originalText.toLowerCase().includes(this.currentSearchTerm.toLowerCase())) {
                        element.innerHTML = this.highlightText(originalText, this.currentSearchTerm);
                    }
                });
            } else {
                // 没有搜索词时正常渲染
                await MarkdownRenderer.render(
                    this.app,
                    content,
                    noteContent,
                    file.path,
                    this
                );
            }

            // 鼠标悬停事件
            card.addEventListener('mouseenter', async () => {
                openButton.style.opacity = '1';  // 显示打开按钮
                title.style.opacity = '0';
                title.style.display = 'none'; 
                noteContent.style.opacity = '1';
                
                // 在预览栏中显示完整内容
                try {
                    this.previewContainer.empty();
                    await MarkdownRenderer.render(
                        this.app,
                        content,
                        this.previewContainer,
                        file.path,
                        this
                    );
                } catch (error) {
                    console.error('预览加载失败:', error);
                }
            });

            // 鼠标离开事件
            card.addEventListener('mouseleave', () => {
                openButton.style.opacity = '0';  // 隐藏打开按钮
                title.style.opacity = '1';
                title.style.display = 'block'; 
                noteContent.style.opacity = '0.3';
                // noteContent.style.display = 'none';
            });

            // 修改事件监听
            openButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openInAppropriateLeaf(file);
                card.addClass('selected'); // 给该卡片添加selected类
                // 移除其余卡片的selected类
                this.container.querySelectorAll('.note-card').forEach(cardElement => {
                    if (cardElement !== card) {
                        cardElement.removeClass('selected');
                    }
                });
            });

            // 单击选择
            card.addEventListener('click', (e) => {
                this.handleCardSelection(file.path, e);
            });

            // 双击打开
            card.addEventListener('dblclick', async () => {
                await this.openInAppropriateLeaf(file);
            });

            // 右键菜单
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // 如果卡片未被选中，先选中它
                if (!card.hasClass('selected')) {
                    // 如果没有按住 Ctrl，清除其他选择
                    if (!e.ctrlKey) {
                        this.clearSelection();
                    }
                    this.selectedNotes.add(file.path);
                    card.addClass('selected');
                    this.lastSelectedNote = file.path;
                }
                
                // 显示右键菜单
                this.showContextMenu(e, this.getSelectedFiles());
            });

        } catch (error) {
            console.error('笔记加载失败:', error);
        }

        // 添加卡片悬停事件
        card.addEventListener('mouseenter', async () => {
            openButton.style.opacity = '1';  // 显示打开按钮
            // ... 其他悬停事件码 ...
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
    private switchView(view: 'card' | 'list' | 'timeline' | 'month') {
        this.currentView = view;
        this.container.setAttribute('data-view', view);
        this.container.empty();
        
        const contentSection = this.containerEl.querySelector('.content-section');
        if (contentSection) {
            contentSection.removeClass('view-card', 'view-list', 'view-timeline', 'view-month');
            contentSection.addClass(`view-${view}`);
        }
        
        if (view === 'list') {
            this.createListView();
        } else if (view === 'timeline') {
            this.createTimelineView();
        } else if (view === 'month') {
            this.createMonthView();
        } else {
            this.loadNotes();
        }
    }

  
    // 切换预览栏的显示状态
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

    // 添加内区域宽度调整方法
    private adjustContentWidth() {
        const mainLayout = this.containerEl.querySelector('.main-layout');
        const previewWidth = this.previewContainer.offsetWidth;
        const contentSection = this.containerEl.querySelector('.content-section');
        
        if (mainLayout instanceof HTMLElement && contentSection instanceof HTMLElement) {
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

  
    // 创建新笔记
    private async createNewNote() {
        // 获取当前日期作为默认文件名
        const date = new Date();
        const fileName = ` ${date.toLocaleString().replace(/[/:]/g, '-')}未命名笔记`;
        
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

    // 创建时间轴视图
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

        // 创建间轴
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
                    
                    // 创建标记
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

    // 刷新视图（用于搜索和过滤）
    private async refreshView() {
        const files = this.app.vault.getMarkdownFiles();
        this.container.empty();

        // 先进行搜索过滤
        const searchTerm = this.currentSearchTerm?.trim().toLowerCase();
        const filteredFiles = await Promise.all(files.map(async file => {
            const matchesSearch = !searchTerm || 
                file.basename.toLowerCase().includes(searchTerm) ||
                await this.fileContentContainsSearch(file);

            // 标签过滤
            let matchesTags = true;
            if (this.selectedTags.size > 0) {
                const cache = this.app.metadataCache.getFileCache(file);
                matchesTags = cache?.tags?.some(t => this.selectedTags.has(t.tag)) ?? false;
            }

            // 日期过滤
            let matchesDate = true;
            if (this.currentFilter.type === 'date') {
                const fileDate = new Date(file.stat.mtime);
                const fileDateStr = fileDate.toISOString().split('T')[0];
                
                if (this.currentFilter.value?.length === 7) {
                    matchesDate = fileDateStr.startsWith(this.currentFilter.value);
                } else {
                    matchesDate = fileDateStr === this.currentFilter.value;
                }
            }

            return matchesSearch && matchesTags && matchesDate ? file : null;
        }));

        // 过滤掉不匹配的文件
        const matchedFiles = filteredFiles.filter((file): file is TFile => file !== null);

        // 创建卡片
        const cards = await Promise.all(
            matchedFiles.map(file => this.createNoteCard(file))
        );

        cards.forEach(card => {
            if (card instanceof HTMLElement) {
                card.style.width = `${this.cardSize}px`;
                this.container.appendChild(card);
            }
        });

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

    // 添加清除标签选择法
    private clearTagSelection() {
        this.selectedTags.clear();
        this.tagContainer.querySelectorAll('.tag-btn').forEach(btn => {
            btn.removeClass('active');
        });
    }

    // 处理卡片择
    private handleCardSelection(path: string, event: MouseEvent) {
        const card = this.container.querySelector(`[data-path="${path}"]`);
        if (!card) {
          this.clearSelection();
          return;
        }

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
                            await this.openInAppropriateLeaf(file);
                        }
                    });
            });

            menu.addItem((item) => {
                item
                    .setTitle(`文件管理器中显示`)
                    .setIcon("folder")
                    .onClick(async () => {
                        const file = files[0];  //示第一个选中文件的位置
                        await this.openInAppropriateLeaf(file,false);
                    });
            });

            menu.addItem((item) => {
                item
                    .setTitle(`移动 ${files.length} 个文`)
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
                            try {
                                // 先删除所有文件
                                for (const file of files) {
                                    await this.app.vault.trash(file, true);
                                }

                                // 文件删除成功后，处理UI动画
                                files.forEach(file => {
                                    const card = this.container.querySelector(`[data-path="${file.path}"]`);
                                    if (card instanceof HTMLElement) {
                                        card.addClass('removing');
                                        // 待动画完成后移除DOM元素
                                        setTimeout(() => {
                                            card.remove();
                                            this.selectedNotes.delete(file.path);
                                        }, 300);
                                    }
                                });
                                // 显示除成功提示
                                console.error(`已删除 ${files.length} 个文件`);
                            } catch (error) {
                                console.error('删除文件失败:', error);
                            }
                        }
                    });
            });
        }

        menu.showAtMouseEvent(event);//显示右键菜单
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

    // 创建日历按钮
    private createCalendarButton(leftTools: HTMLElement) {
        const calendarBtn = leftTools.createEl('button', {
            cls: 'calendar-toggle-button',
        });
        calendarBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>日历</span>
        `;
        calendarBtn.addEventListener('click', () => {
            this.toggleCalendar();
            // 切换按钮高亮状态
            calendarBtn.toggleClass('active', this.isCalendarVisible);
        });
    }

    // 切换日历的显示状态
    private toggleCalendar() {
        console.log('切换日历显示状态, 当前状态:', this.isCalendarVisible);
        
        this.isCalendarVisible = !this.isCalendarVisible;
        
        if (this.isCalendarVisible) {
            this.showCalendar();
            // 显示当前月份的所有笔记
            this.filterNotesByMonth(this.currentDate);
        } else {
            this.hideCalendar();
            // 清除日期滤
            this.clearDateFilter();
        }
        
        // 更新按钮状态
        const calendarBtn = this.containerEl.querySelector('.calendar-toggle-button');
        if (calendarBtn) {
            calendarBtn.toggleClass('active', this.isCalendarVisible);
        }
    }

    // 添加按月份过滤的方法
    private filterNotesByMonth(date: Date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        this.currentFilter = { 
            type: 'date', 
            value: `${year}-${(month + 1).toString().padStart(2, '0')}` 
        };
        this.refreshView();
    }

    // 显示日历
    private showCalendar() {
        // 添加调试日志
        console.log('开始显示日历');
        
        // 确保 calendarContainer 存在
        if (!this.calendarContainer) {
            console.log('创建日历容器');
            const mainLayout = this.containerEl.querySelector('.main-layout');
            if (!mainLayout) {
                console.error('未找到 main-layout 元素');
                return;
            }
            
            // 创建日历容器
            this.calendarContainer = createDiv();
            this.calendarContainer.addClass('calendar-container');
            
            // 将日历容器插入到 main-layout 的开头
            mainLayout.insertBefore(this.calendarContainer, mainLayout.firstChild);
            
            console.log('日历容器已创建:', this.calendarContainer);
        }
        
        // 清空并显示日历容器
        this.calendarContainer.empty();
        this.calendarContainer.style.display = 'block';
        
        // 添加日历内容
        this.renderCalendar();
        
        // 添加 with-calendar 类到 main-layout
        const mainLayout = this.containerEl.querySelector('.main-layout');
        if (mainLayout) {
            mainLayout.addClass('with-calendar');
            console.log('已添加 with-calendar 类 main-layout');
        }
        
        // 确保日历容器可见
        this.calendarContainer.style.opacity = '1';
        this.calendarContainer.style.visibility = 'visible';
    }

    // 隐藏日历 
    private hideCalendar() {
        console.log('隐藏日历');
        
        if (this.calendarContainer) {
            this.calendarContainer.style.display = 'none';
            this.calendarContainer.empty();
            
            // 移除 with-calendar 类
            const mainLayout = this.containerEl.querySelector('.main-layout');
            if (mainLayout) {
                mainLayout.removeClass('with-calendar');
                console.log('已移除 with-calendar 类');
            }
        }
    }

    // 渲染日历
    private renderCalendar() {
        if (!this.calendarContainer) {
            return;
        }
        
        this.calendarContainer.empty();
        
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // 创建日历头部
        const header = this.calendarContainer.createDiv('calendar-header');
        
        // 上个月按钮
        const prevBtn = header.createEl('button', { cls: 'calendar-nav-btn' });
        prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.currentDate = new Date(year, month - 1, 1);
            this.renderCalendar();
            // 显示新月份的笔记
            this.filterNotesByMonth(this.currentDate);
        });
        
        // 显示年月
        header.createDiv('calendar-title').setText(
            `${year}年${month + 1}月`
        );
        
        // 下个月按钮
        const nextBtn = header.createEl('button', { cls: 'calendar-nav-btn' });
        nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.currentDate = new Date(year, month + 1, 1);
            this.renderCalendar();
            // 显示新月份的笔记
            this.filterNotesByMonth(this.currentDate);
        });

        // 创建星头部
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekHeader = this.calendarContainer.createDiv('calendar-weekdays');
        weekdays.forEach(day => {
            weekHeader.createDiv('weekday').setText(day);
        });

        // 创建日期网格
        const grid = this.calendarContainer.createDiv('calendar-grid');
        
        // 获取当月第一天是星期几
        const firstDay = new Date(year, month, 1).getDay();
        
        // 获取当月天数
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // 取每天的笔记数量
        const notesCount = this.getNotesCountByDate(year, month);

        // 填充日期格子
        for (let i = 0; i < firstDay; i++) {
            grid.createDiv('calendar-day empty');
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = grid.createDiv('calendar-day');
            const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            
            dayEl.setText(day.toString());
            dayEl.setAttribute('data-date', dateStr);
            
            // 如果是当前过滤的日期添加选中样式
            if (this.currentFilter.type === 'date' && this.currentFilter.value === dateStr) {
                dayEl.addClass('selected');
            }
            
            // 添加笔记数量标记
            const count = notesCount[dateStr] || 0;
            if (count > 0) {
                dayEl.createDiv('note-count').setText(count.toString());
            }

            // 添加点击事件
            dayEl.addEventListener('click', () => {
                this.filterNotesByDate(dateStr);
            });
        }
    }

    // 获取每天的笔记数量
    private getNotesCountByDate(year: number, month: number): Record<string, number> {
        const counts: Record<string, number> = {};
        const files = this.app.vault.getMarkdownFiles();

        files.forEach(file => {
            const date = new Date(file.stat.mtime);
            if (date.getFullYear() === year && date.getMonth() === month) {
                const dateStr = date.toISOString().split('T')[0];
                counts[dateStr] = (counts[dateStr] || 0) + 1;
            }
        });

        return counts;
    }

    // 根据日期过滤笔记
    private filterNotesByDate(dateStr: string) {
        // 如果已经选中了这个日期，则清除过滤
        if (this.currentFilter.type === 'date' && this.currentFilter.value === dateStr) {
            this.clearDateFilter();
            return;
        }

        // 清除其他日期的选中状态
        this.calendarContainer.querySelectorAll('.calendar-day').forEach(day => {
            day.removeClass('selected');
        });

        // 设置新的过滤条件
        this.currentFilter = { type: 'date', value: dateStr };
        
        // 高亮中的日期
        const selectedDay = this.calendarContainer.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if (selectedDay) {
            selectedDay.addClass('selected');
        }

        this.refreshView();
    }

    // 添加清除日期过滤的方法
    private clearDateFilter() {
        this.currentFilter = { type: 'none' };
        // 清除所有日期选中状态
        if (this.calendarContainer) {
            this.calendarContainer.querySelectorAll('.calendar-day').forEach(day => {
                day.removeClass('selected');
            });
        }
        // 刷新视图显示所有笔记
        this.refreshView();
    }


    // 修改方法名以更好地反映其功能
    private async openInAppropriateLeaf(file: TFile, openFile: boolean = true) {
        try {
            if (openFile) {
                // 只有在需要打开文件时才执行这些操作
                const leaves = this.app.workspace.getLeavesOfType('markdown');
                const currentRoot = this.leaf.getRoot();
                const otherLeaf = leaves.find(leaf => {
                    const root = leaf.getRoot();
                    return root !== currentRoot;
                });
                
                let targetLeaf;
                if (otherLeaf) {
                    await otherLeaf.openFile(file);
                    targetLeaf = otherLeaf;
                } else {
                    targetLeaf = this.app.workspace.getLeaf('tab');
                    await targetLeaf.openFile(file);
                }
                
                this.app.workspace.setActiveLeaf(targetLeaf);
            }
            
            // 无论是否打开文件，都在文件管理器中定位文件
            const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
            if (fileExplorer && fileExplorer.view) {
                await (fileExplorer.view as any).revealInFolder(file);
            }
            
        } catch (error) {
            console.error('操作失败:', error);
            new Notice('操作失败');
        }
    }

    // 在类的开头添加一个高亮文本的辅助方法
    private highlightText(text: string, searchTerm: string): string {
        if (!searchTerm || searchTerm.trim() === '') {
            return text; // 如果搜索词为空，直接返回原文本
        }
        
        const escapedSearchTerm = searchTerm
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
            .trim(); // 确保去除空格
        
        const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    }

    // 添加内容搜索方法
    private async fileContentContainsSearch(file: TFile): Promise<boolean> {
        if (!this.currentSearchTerm || this.currentSearchTerm.trim() === '') {
            return true;
        }

        try {
            const content = await this.app.vault.cachedRead(file);
            const searchTerm = this.currentSearchTerm.trim().toLowerCase();
            const fileContent = content.toLowerCase();
            
            // 检查文件内容是否包含搜索词
            return fileContent.includes(searchTerm);
        } catch (error) {
            console.error('读取文件内容失败:', error);
            return false;
        }
    }

    // 在 CardView 类中添加搜索处理方法
    private setupSearch() {
        // 使用防抖来处理快速输入
        const debounce = (fn: Function, delay: number) => {
            let timeoutId: NodeJS.Timeout;
            return  (...args: any[]) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => fn.apply(this, args), delay);
            };
        };

        // 处理搜索输入
        this.searchInput.addEventListener('input', debounce(() => {
            this.currentSearchTerm = this.searchInput.value.trim();
            this.refreshView();
        }, 200));
    }

    // 修改创建命令按钮的方法
    private createCommandButton(toolbar: HTMLElement) {
        const commandContainer = toolbar.createDiv('command-container');
        
        // 创建命令按钮
        const commandBtn = commandContainer.createEl('button', {
            cls: 'command-button',
        });
        commandBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
        `;
        commandBtn.setAttribute('title', '命令菜单');

        // 创建菜单容器
        const menu = commandContainer.createDiv('command-menu');
        menu.style.display = 'none';

        // 添加菜单项
        const deleteEmptyNotesItem = menu.createDiv('command-menu-item');
        deleteEmptyNotesItem.setText('删除所选空白笔记');
        deleteEmptyNotesItem.addEventListener('click', () => {
            menu.style.display = 'none';  // 点击后隐藏菜单
            this.deleteEmptyNotes();
        });

        const batchRenameItem = menu.createDiv('command-menu-item');
        batchRenameItem.setText('批量重命名');
        batchRenameItem.addEventListener('click', () => {
            menu.style.display = 'none';  // 点击后隐藏菜单
            console.log('批量重命名功能待实现');
        });

        // 使用点击事件替代鼠标悬停事件
        let isMenuVisible = false;
        
        // 点击按钮时切换菜单显示状态
        commandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isMenuVisible = !isMenuVisible;
            menu.style.display = isMenuVisible ? 'block' : 'none';
        });

        // 点击其他地方时隐藏菜单
        document.addEventListener('click', (e) => {
            if (!commandContainer.contains(e.target as Node)) {
                isMenuVisible = false;
                menu.style.display = 'none';
            }
        });
    }

    // 添加删除白笔记的方法
    private async deleteEmptyNotes() {
        const selectedFiles = this.getSelectedFiles();
        if (selectedFiles.length === 0) {
            // 如果没有选中的笔记，提示用户
            new Notice('请先选择要检查的笔记');
            return;
        }

        // 检查空白笔记
        const emptyNotes: TFile[] = [];
        for (const file of selectedFiles) {
            const content = await this.app.vault.read(file);
            // 移除所有空白字符后检查是否为空
            if (!content.trim()) {
                emptyNotes.push(file);
            }
        }

        if (emptyNotes.length === 0) {
            new Notice('所选笔记中没有空白笔记');
            return;
        }

        // 显示确认对话框
        const confirmModal = new ConfirmModal(
            this.app,
            "确认删除空白笔记",
            `是否删除以下 ${emptyNotes.length} 个空白笔记？\n${emptyNotes.map(file => file.basename).join('\n')}`
        );

        if (await confirmModal.show()) {
            // 执行删除
            for (const file of emptyNotes) {
                await this.app.vault.trash(file, true);
            }
            // 刷新视图
            this.refreshView();
            new Notice(`已删除 ${emptyNotes.length} 个空白笔记`);
        }
    }

    // 修改 createMonthView 方法中的年份显示部分
    private createMonthView() {
        if (!this.container.querySelector('.month-view')) {
            const monthContainer = this.container.createDiv('month-view');
            
            // 创建月视图头部
            const header = monthContainer.createDiv('month-header');
            
            // 创建年份显示区域
            const yearGroup = header.createDiv('year-group');
            
            // 添加上一年按钮
            const prevYearBtn = yearGroup.createEl('button', { cls: 'year-nav-btn' });
            prevYearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
            
            // 创建年份显示
            const yearDisplay = yearGroup.createDiv('year-display');
            yearDisplay.setText(this.currentDate.getFullYear().toString());
            
            // 添加下一年按钮
            const nextYearBtn = yearGroup.createEl('button', { cls: 'year-nav-btn' });
            nextYearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
            
            // 添加年份切换事件
            prevYearBtn.addEventListener('click', () => this.navigateYear(-1));
            nextYearBtn.addEventListener('click', () => this.navigateYear(1));

            // 创建月份选择器
            const monthSelector = header.createDiv('month-selector');
            
            // 创建12个月份按钮
            for (let i = 1; i <= 12; i++) {
                const monthBtn = monthSelector.createDiv({
                    cls: `month-btn ${i === this.currentDate.getMonth() + 1 ? 'active' : ''}`,
                    text: i.toString()
                });
                
                // 添加点击事件
                monthBtn.addEventListener('click', () => {
                    this.selectMonth(i - 1);
                });
            }
            
            // 添加今天按钮
            const todayBtn = header.createEl('button', { 
                cls: 'today-btn',
                text: '今天'
            });
            todayBtn.addEventListener('click', () => this.goToToday());
            
            // 添加滚轮事件
            monthSelector.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.navigateMonth(e.deltaY > 0 ? 1 : -1);
            });
            
            // 创建星期头部
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekHeader = monthContainer.createDiv('month-weekdays');
            weekdays.forEach(day => {
                weekHeader.createDiv('weekday').setText(day);
            });
            
            // 创建日历网格
            monthContainer.createDiv('month-grid');
        }
        
        this.updateMonthView();
    }

    // 修改月份选择方法
    private selectMonth(month: number) {
        this.currentDate = new Date(this.currentDate.getFullYear(), month);
        this.updateMonthView();
    }

    // 修改更新月视图的方法
    private updateMonthView() {
        const monthView = this.container.querySelector('.month-view');
        if (!monthView) return;

        // 更新年份显示
        const yearDisplay = monthView.querySelector('.year-display');
        if (yearDisplay) {
            yearDisplay.setText(this.currentDate.getFullYear().toString());
        }

        // 更新月份选择器
        const monthBtns = monthView.querySelectorAll('.month-btn');
        monthBtns.forEach((btn, index) => {
            btn.toggleClass('active', index === this.currentDate.getMonth());
        });

        // 更新网格
        const grid = monthView.querySelector('.month-grid');
        if (grid) {
            grid.empty();
            this.renderMonthGrid(grid as HTMLElement);
        }
    }

    // 修改月份导航方法
    private navigateMonth(delta: number) {
        const newDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + delta);
        
        // 如果年份变化，需要更新年份显示
        if (newDate.getFullYear() !== this.currentDate.getFullYear()) {
            const yearDisplay = this.container.querySelector('.year-display');
            if (yearDisplay) {
                yearDisplay.setText(newDate.getFullYear().toString());
            }
        }
        
        this.currentDate = newDate;
        this.updateMonthView();
    }

    // 添加跳转到今天的方法
    private goToToday() {
        this.currentDate = new Date();
        this.updateMonthView();
    }

    // 修改 renderMonthGrid 方法中的日期格子创建部分
    private renderMonthGrid(grid: HTMLElement) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        // 获取今天的日期
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
        
        // 获取当月的笔记
        const notesByDate = this.getNotesByDate(year, month);
        
        // 填充前置空白日期
        for (let i = 0; i < firstDay.getDay(); i++) {
            grid.createDiv('month-day empty');
        }
        
        // 填充日期子
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dateCell = grid.createDiv('month-day');
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // 检查是否是今天
            if (isCurrentMonth && today.getDate() === day) {
                dateCell.addClass('today');
            }
            
            // 添加日期数字
            dateCell.createDiv('day-number').setText(String(day));
            
            // 添加笔记列表
            const dayNotes = notesByDate[dateStr] || [];
            if (dayNotes.length > 0) {
                const notesList = dateCell.createDiv('day-notes');
                
                // 显示所有笔记
                dayNotes.forEach(note => {
                    const noteItem = notesList.createDiv('day-note-item');
                    noteItem.setText(note.basename);
                    
                    // 添加点击事件
                    noteItem.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await this.openInAppropriateLeaf(note);
                    });
                    
                    // 添加预览功能
                    noteItem.addEventListener('mouseenter', async () => {
                        try {
                            this.previewContainer.empty();
                            const content = await this.app.vault.read(note);
                            await MarkdownRenderer.render(
                                this.app,
                                content,
                                this.previewContainer,
                                note.path,
                                this
                            );
                        } catch (error) {
                            console.error('预览加载失败:', error);
                        }
                    });
                });
            }
        }
    }

    // 添加获取指定月份笔记的方法
    private getNotesByDate(year: number, month: number): Record<string, TFile[]> {
        const notesByDate: Record<string, TFile[]> = {};
        const files = this.app.vault.getMarkdownFiles();
        
        files.forEach(file => {
            const fileDate = new Date(file.stat.mtime);
            if (fileDate.getFullYear() === year && fileDate.getMonth() === month) {
                const dateStr = fileDate.toISOString().split('T')[0];
                if (!notesByDate[dateStr]) {
                    notesByDate[dateStr] = [];
                }
                notesByDate[dateStr].push(file);
            }
        });
        
        return notesByDate;
    }

    // 添加格式化月份标题的方法
    private formatMonthTitle(date: Date): string {
        return `${date.getFullYear()}年${date.getMonth() + 1}月`;
    }

    // 添加年份导航方法
    private navigateYear(delta: number) {
        this.currentDate = new Date(this.currentDate.getFullYear() + delta, this.currentDate.getMonth());
        this.updateMonthView();
    }

    // 修改 createListView 方法
    private async createListView() {
        // 获取所有笔记并按文件夹分组
        const files = this.app.vault.getMarkdownFiles();//获取所有笔记
        const notesByFolder = new Map<string, TFile[]>();//按件夹分组
        const folderStructure = new Map<string, Map<string, TFile[]>>();//文件夹结构
        
        // 构建文件夹结构和分组笔记
        files.forEach(file => {
            const pathParts = file.path.split('/');
            if (pathParts[0] === '' || !pathParts[0]) {
                // 根目录下的笔记放入"未分类"
                if (!folderStructure.has('未分类')) {
                    folderStructure.set('未分类', new Map([['', []]]));
                }
                folderStructure.get('未分类')?.get('')?.push(file);
            } else {
                const rootFolder = pathParts[0];
                const subFolder = pathParts.length > 2 ? pathParts[1] : '';
                
                // 初始根文件夹结构
                if (!folderStructure.has(rootFolder)) {
                    folderStructure.set(rootFolder, new Map());
                }
                
                // 将笔记添加到对应的文件夹中
                if (subFolder) {
                    if (!folderStructure.get(rootFolder)?.has(subFolder)) {
                        folderStructure.get(rootFolder)?.set(subFolder, []);
                    }
                    folderStructure.get(rootFolder)?.get(subFolder)?.push(file);
                } else {
                    if (!folderStructure.get(rootFolder)?.has('')) {
                        folderStructure.get(rootFolder)?.set('', []);
                    }
                    folderStructure.get(rootFolder)?.get('')?.push(file);
                }
            }
        });
        
        // 创建文件夹视图
        for (const [rootFolder, subFolders] of folderStructure) {
            const folderGroup = this.container.createDiv('folder-group');
            
            // 创建文件夹组标题
            const folderHeader = folderGroup.createDiv('folder-header');
            
            // 添加文件夹图标
            const folderIcon = folderHeader.createDiv('folder-icon');
            folderIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
            
            // 添加文件夹名称
            const folderName = folderHeader.createDiv('folder-name');
            folderName.setText(rootFolder);
            
            // 创建内容区域
            const contentArea = folderGroup.createDiv('folder-content-area');
            
            // 创建左侧子文件夹导航
            const sideNav = contentArea.createDiv('folder-sidebar');
            
            // 创建根文件夹的笔记选项
            const rootNotes = subFolders.get('') || [];
            if (rootNotes.length > 0) {
                const rootTitle = sideNav.createDiv('folder-title root');
                rootTitle.setText('当前目录');
                rootTitle.addEventListener('click', () => {
                    this.showFolderContent(notesArea, rootNotes);
                    sideNav.querySelectorAll('.folder-title').forEach(el => el.removeClass('active'));
                    rootTitle.addClass('active');
                });
            }
            
            // 创建子文件夹列表
            for (const [subFolder, notes] of subFolders) {
                if (subFolder !== '') {
                    const subTitle = sideNav.createDiv('folder-title sub');
                    subTitle.setText(subFolder);
                    subTitle.addEventListener('mouseenter', () => {
                        this.showFolderContent(notesArea, notes);
                        sideNav.querySelectorAll('.folder-title').forEach(el => el.removeClass('active'));
                        subTitle.addClass('active');
                    });
                }
            }
            
            // 创建右侧笔记区域
            const notesArea = contentArea.createDiv('folder-content');
            
            // 默认显示根文件夹的笔记
            this.showFolderContent(notesArea, rootNotes);
        }
    }

    private showFolderContent(container: HTMLElement, notes: TFile[]) {
        container.empty();
        
        // 按修改时间排序
        notes.sort((a, b) => b.stat.mtime - a.stat.mtime);
        
        // 创建笔记列表
        const notesList = container.createDiv('notes-list');
        
        // 遍历所有笔记创建笔记项
        notes.forEach(note => {
            const noteItem = notesList.createDiv('note-item');
            noteItem.setAttribute('data-path', note.path);
            
            // 添加笔记标题
            const noteTitle = noteItem.createDiv('note-title');
            noteTitle.setText(note.basename);
            
            // 添加修改日期
            const noteDate = noteItem.createDiv('note-date');
            noteDate.setText(new Date(note.stat.mtime).toLocaleString());
            
            // 添加事件监听
            this.addNoteItemEvents(noteItem, note);
        });
    }

    // 添加 addNoteItemEvents 方法
    private addNoteItemEvents(noteItem: HTMLElement, note: TFile) {
        // 单击选择
        noteItem.addEventListener('click', (e) => {
            this.handleCardSelection(note.path, e);
        });

        // 双击打开
        noteItem.addEventListener('dblclick', async () => {
            await this.openInAppropriateLeaf(note);
        });

        // 右键菜单
        noteItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, this.getSelectedFiles());
        });

        // 悬停预览
        noteItem.addEventListener('mouseenter', async () => {
            try {
                this.previewContainer.empty();
                const content = await this.app.vault.read(note);
                await MarkdownRenderer.render(
                    this.app,
                    content,
                    this.previewContainer,
                    note.path,
                    this
                );
            } catch (error) {
                console.error('预览加载失败:', error);
            }
        });
    }

    // 添加刷新标签的方法
    public refreshTags() {
        this.loadTags();
    }
}

// 添加确认对话框
class ConfirmModal extends Modal {
    private result: boolean = false;
    private resolvePromise: (value: boolean) => void = () => {};  // 添加默认值
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
            recentSection.createEl('h4', { text: '最使用' });
            
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

            // 添加文件夹图标和名称
            const icon = item.createSpan({
                cls: 'folder-icon'
            });
            icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
            const nameSpan = item.createSpan({
                cls: 'folder-name'
            });
            nameSpan.textContent = folder.name;

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
            "确认 移动",
            `是否将选中的 ${this.files.length} 个文件移动到 "${targetFolder}"？`
        );

        if (await confirmModal.show()) {
            for (const file of this.files) {
                const newPath = `${targetFolder}/${file.name}`;
                await this.app.fileManager.renameFile(file, newPath);
            }

            // 更新最近使用 的文件夹
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