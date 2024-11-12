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
    private container: HTMLElement;
    private tagContainer: HTMLElement;
    private previewContainer: HTMLElement;
    private previewResizer: HTMLElement;
    private isPreviewCollapsed: boolean;
    private searchInput: HTMLInputElement;
    private currentSearchTerm: string;
    private selectedTags: Set<string>;
    private selectedNotes: Set<string>;
    private lastSelectedNote: string | null;
    private recentFolders: string[];
    private cardSize: number;
    private cardHeight: number;
    private calendarContainer: HTMLElement;
    private isCalendarVisible: boolean;
    private currentDate: Date;
    private currentFilter: { type: 'date' | 'none', value?: string };
    private monthViewContainer: HTMLElement;
    private isMonthViewVisible: boolean;
    private loadedNotes: Set<string>;
    private currentPage: number;
    private pageSize: number;
    private isLoading: boolean;
    private hasMoreNotes: boolean;
    private loadingIndicator: HTMLElement;
    private timelineCurrentPage: number;
    private timelinePageSize: number;
    private timelineIsLoading: boolean;
    private timelineHasMore: boolean;
    private timelineLoadingIndicator: HTMLElement;
    private statusBar: HTMLElement;
    private statusLeft: HTMLElement;
    private statusRight: HTMLElement;
    private loadingStatus: HTMLElement;
    private currentLoadingView: 'card' | 'list' | 'timeline' | 'month' | null;
    private cardSettings: {
        showDate: boolean;
        showContent: boolean;
        cardWidth: number;
        cardHeight: number;
        cardGap: number;
        cardsPerRow: number;
    };
    private scrollTimeout: NodeJS.Timeout | null = null;
    private intersectionObserver!: IntersectionObserver;

    constructor(leaf: WorkspaceLeaf, plugin: CardViewPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentView = 'card';
        this.container = createDiv();
        this.tagContainer = createDiv();
        this.previewContainer = createDiv();
        this.previewResizer = createDiv();
        this.isPreviewCollapsed = false;
        this.searchInput = createEl('input');
        this.currentSearchTerm = '';
        this.selectedTags = new Set();
        this.selectedNotes = new Set();
        this.lastSelectedNote = null;
        this.recentFolders = [];
        this.cardSize = 280;
        this.cardHeight = 280;
        this.calendarContainer = createDiv();
        this.isCalendarVisible = false;
        this.currentDate = new Date();
        this.currentFilter = { type: 'none' };
        this.monthViewContainer = createDiv();
        this.isMonthViewVisible = false;
        this.loadedNotes = new Set();
        this.currentPage = 1;
        this.pageSize = 20;
        this.isLoading = false;
        this.hasMoreNotes = true;
        this.loadingIndicator = createDiv('loading-indicator');
        this.timelineCurrentPage = 1;
        this.timelinePageSize = 10;
        this.timelineIsLoading = false;
        this.timelineHasMore = true;
        this.timelineLoadingIndicator = createDiv('timeline-loading-indicator');
        this.statusBar = createDiv('status-bar');
        this.statusLeft = createDiv('status-left');
        this.statusRight = createDiv('status-right');
        this.loadingStatus = createDiv('status-item');
        this.currentLoadingView = null;
        this.cardSettings = {
            showDate: true,
            showContent: true,
            cardWidth: 280,
            cardHeight: 280,
            cardGap: 16,
            cardsPerRow: 0
        };

        // 初始化 Intersection Observer
        this.setupIntersectionObserver();
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
        
        // 新建笔记按
        const newNoteBtn = leftTools.createEl('button', {
            cls: 'new-note-button',
        });
        newNoteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>新建笔记</span>
        `;
        newNoteBtn.addEventListener('click', () => this.createNewNote());

        // 添加日历按钮
        this.createCalendarButton(leftTools);

        // 视图切换按钮组
        const viewSwitcher = leftTools.createDiv('view-switcher');
        this.createViewSwitcher(viewSwitcher);

        // 右侧搜索框
        const searchContainer = toolbar.createDiv('search-container');
        
        // 添加命令按钮
        this.createCommandButton(searchContainer);
        
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: '搜索笔记...',
            cls: 'search-input'
        });

        // 创建快速笔记栏（放在主布局容器的最前面）
        const quickNoteBar = mainLayout.createDiv('quick-note-bar');
        quickNoteBar.addClass('minimized'); // 默认添加最小化类

        // 设置初始位置在右下角
        const workspaceLeafContent = this.containerEl.closest('.workspace-leaf-content');
        if (workspaceLeafContent) {
            // 使用 requestAnimationFrame 确保在 DOM 完全加载后设置位置
            requestAnimationFrame(() => {
                const leafRect = workspaceLeafContent.getBoundingClientRect();
                // 计算右下角位置
                const right = 20; // 距右边距
                const bottom = 20; // 距底边距
                
                quickNoteBar.style.position = 'absolute';
                quickNoteBar.style.right = `${right}px`;
                quickNoteBar.style.bottom = `${bottom}px`;
                quickNoteBar.style.left = 'auto';
                quickNoteBar.style.top = 'auto';
                quickNoteBar.style.transform = 'none';
                quickNoteBar.style.width = '40px';
                quickNoteBar.style.height = '40px';
            });
        }

        // 添加控制按钮
        const controls = quickNoteBar.createDiv('quick-note-controls');

        // 最小化按钮
        const minimizeBtn = controls.createEl('button', {
            cls: 'control-button minimize-btn',
        });
        minimizeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

        // 最小化图标
        const minimizeIcon = quickNoteBar.createDiv('minimize-icon');
        minimizeIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

        // 拖拽功能
        this.setupDraggable(quickNoteBar);

        // 添加不同的最小化功能
        minimizeBtn.addEventListener('click', () => {
            this.minimizeQuickNote(quickNoteBar);
        });

        minimizeIcon.addEventListener('click', () => {
            this.restoreQuickNote(quickNoteBar);
        });

        const inputContainer = quickNoteBar.createDiv('quick-note-input-container');

        // 创建标题输入框
        const titleInput = inputContainer.createEl('input', {
            cls: 'quick-note-title',
            attr: {
                placeholder: '输入笔记标题...',
                type: 'text'
            }
        });

        // 创建文本输入框
        const noteInput = inputContainer.createEl('textarea', {
            cls: 'quick-note-input',
            attr: {
                placeholder: '输入笔记内容，按 Enter 发送...'
            }
        });

        // 创建标签容器和标签集
        const tagsContainer = inputContainer.createDiv('tags-container');
        const tags = new Set<string>();

        // 创建标签输入框
        const tagInput = tagsContainer.createEl('input', {
            cls: 'tag-input',
            attr: {
                placeholder: '添加标签...'
            }
        });

        // 创建工具栏
        const quickNoteToolbar = inputContainer.createDiv('quick-note-toolbar');

        // 添加代码按钮
        const codeBtn = quickNoteToolbar.createEl('button', {
            cls: 'quick-note-btn',
            attr: { 'data-type': 'code' }
        });
        codeBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            代码
        `;

        // 添加图片按钮
        const imageBtn = quickNoteToolbar.createEl('button', {
            cls: 'quick-note-btn',
            attr: { 'data-type': 'image' }
        });
        imageBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            图片
        `;

        // 添加灵感按钮
        const ideaBtn = quickNoteToolbar.createEl('button', {
            cls: 'quick-note-btn',
            attr: { 'data-type': 'idea' }
        });
        ideaBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            灵感
        `;

        // 创建标签建议容器
        const tagSuggestions = inputContainer.createDiv('tag-suggestions');

        // 添加事件处理
        this.setupQuickNoteEvents(noteInput, quickNoteToolbar, tagSuggestions);

        // 初始化搜索处理
        this.setupSearch();

        // 标签栏
        this.tagContainer = contentSection.createDiv('filter-toolbar');
        await this.loadTags();

        // 创建主内容区域
        const contentArea = contentSection.createDiv('card-view-content');
        this.container = contentArea.createDiv('card-container');
        
        // 使用保存的宽度和高度初始化卡片容器
        this.cardSize = this.plugin.settings.cardWidth;
        // 删除读取高度的代码，因为cardHeight属性不存
        this.container.style.gridTemplateColumns = `repeat(auto-fill, ${this.cardSize}px`;
        
        // 添加滚轮事件监听
        this.container.addEventListener('wheel', (e: WheelEvent) => {
            if (e.ctrlKey || e.shiftKey) {
                e.preventDefault();
                
                if (e.ctrlKey) {
                    // Ctrl + 滚轮调整宽度
                    this.adjustCardSize(e.deltaY);
                } else if (e.shiftKey) {
                    // Shift + 滚轮调整高度
                    this.adjustCardHeight(e.deltaY);
                }
            }
        });

        // 创建预览域
        const previewWrapper = mainLayout.createDiv('preview-wrapper');

        // 添加预控制按钮
        const previewControls = previewWrapper.createDiv('preview-controls');
        const toggleButton = previewControls.createEl('button', {
            cls: 'preview-toggle',
            attr: { 'aria-label': '折叠预览' }
        });
        toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-right"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

        toggleButton.addEventListener('click', () => this.togglePreview());

        // 添加调整宽度的分隔线
        this.previewResizer = previewWrapper.createDiv('preview-resizer');

        // 创建预览容器
        this.previewContainer = previewWrapper.createDiv('preview-container');

        // 设置预览栏调整功能
        this.setupResizer();

        // 设置滚动同步
        this.setupScrollSync();

        // 在 mainLayout 的末尾添加状态栏
        this.statusBar.empty();
        this.statusLeft.empty();
        this.statusRight.empty();
        
        // 添加加载状态指示器
        this.loadingStatus.innerHTML = `
            <div class="loading-indicator">
                <div class="loading-spinner"></div>
                <span>准备加载...</span>
            </div>
        `;
        this.statusLeft.appendChild(this.loadingStatus);
        
        // 添其他状态信息
        const totalNotesStatus = createDiv('status-item');
        totalNotesStatus.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            <span>总笔记数: ${this.app.vault.getMarkdownFiles().length}</span>
        `;
        this.statusRight.appendChild(totalNotesStatus);
        
        this.statusBar.appendChild(this.statusLeft);
        this.statusBar.appendChild(this.statusRight);
        contentSection.appendChild(this.statusBar); // 修改这里，将状态栏添加到 contentSection
        
        // 设置初始加载视图
        this.currentLoadingView = 'card';
        await this.loadNotes();

        // 初始化日历容器
        this.calendarContainer = createDiv();
        this.calendarContainer.addClass('calendar-container');
        this.calendarContainer.style.display = 'none';
        
        // 将日容器添加到主布局中
        const mainLayoutElement = containerEl.querySelector('.main-layout');  // 修改变量名
        if (mainLayoutElement) {
            mainLayout.insertBefore(this.calendarContainer, mainLayout.firstChild);
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
                } // 里添加缺失的合括号
            });
        }

      

        // 在创建输入框后添加发送按钮
        const sendButton = inputContainer.createEl('button', {
            cls: 'quick-note-send',
            attr: {
                'title': '发送笔记'
            }
        });
        sendButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        `;

        // 直接在这里绑定发送按钮的点击事件
        sendButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const title = titleInput?.value?.trim();
            const content = noteInput.value.trim();
            
            if (!content) {
                new Notice('请输入笔记内容');
                return;
            }

            try {
                // 获取所有已添加的标签
                const tagItems = tagsContainer?.querySelectorAll('.tag-item') ?? [];
                const tagTexts = Array.from(tagItems).map(item => item.textContent?.replace('×', '').trim() ?? '');
                
                // 构建笔记内容包含标签
                const tagsContent = tagTexts.map(tag => `#${tag}`).join(' ');
                const finalContent = tagsContent ? `${tagsContent}\n\n${content}` : content;
                
                // 使用标题作为文件名，如果没有则使用日期
                const fileName = title || new Date().toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }).replace(/\//g, '-');

                // 创建笔记
                const file = await this.createQuickNote(finalContent, [], fileName);
                
                if (file) {
                    // 清理输入状态
                    this.clearQuickNoteInputs(titleInput ?? null, noteInput, tags, tagsContainer ?? null, tagInput ?? null);
                    
                    // 刷新视图
                    await this.refreshView();
                    
                    new Notice('笔创建成功');
                }
            } catch (error) {
                console.error('创建笔记失败:', error);
                new Notice('创建笔记失败');
            }
        });

        // 在 onOpen 方法中，创建 quick-note-bar 后添加背景遮罩
        const quickNoteBackdrop = mainLayout.createDiv('quick-note-backdrop');

    }

    /**
     * 获取所有笔记中的标签
     * @returns 去后的标签组
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
     * 加载有标签并创标签过滤器
     */
    private async loadTags() {
        const tagCounts = this.getTagsWithCount();
        this.tagContainer.empty();

        // 创建左侧区域
        const leftArea = this.tagContainer.createDiv('filter-toolbar-left');

        // 创建下拉列表容器
        const dropdownContainer = leftArea.createDiv('tag-dropdown-container');
        
        // 创建下拉列表
        const dropdown = dropdownContainer.createEl('select', {
            cls: 'tag-dropdown'
        });

        // 添加默认选项
        dropdown.createEl('option', {
            text: '标签',
            value: ''
        });

        // 创建自定义下拉面板
        const dropdownPanel = dropdownContainer.createDiv('dropdown-panel');

        // 添加所有标签选项
        Array.from(tagCounts.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([tag, count]) => {
                // 创建选项元素
                const option = dropdownPanel.createDiv('dropdown-option');
                option.createSpan({ text: tag });
                option.createSpan({ 
                    text: count.toString(),
                    cls: 'tag-count'
                });

                // 添加点击事件
                option.addEventListener('click', () => {
                    if (!this.selectedTags.has(tag)) {
                        this.addSelectedTag(tag, selectedTagsContainer);
                        this.selectedTags.add(tag);
                        this.refreshView();
                    }
                    dropdown.value = '';  // 重置下拉列表
                });
            });

        // 创建右侧已选标签容器
        const selectedTagsContainer = leftArea.createDiv('selected-tags-container');

        // 修改下拉列表的显示/隐藏逻辑
        let isMouseOverDropdown = false;
        let isMouseOverPanel = false;
        let hideTimeout: NodeJS.Timeout;

        // 鼠标进入下拉框时显示面板
        dropdown.addEventListener('mouseenter', () => {
            isMouseOverDropdown = true;
            clearTimeout(hideTimeout);
            dropdownPanel.style.display = 'grid';
        });

        // 鼠标离开下拉框时
        dropdown.addEventListener('mouseleave', () => {
            isMouseOverDropdown = false;
            // 如果鼠标不在面板上，延迟隐藏
            if (!isMouseOverPanel) {
                hideTimeout = setTimeout(() => {
                    if (!isMouseOverDropdown && !isMouseOverPanel) {
                        dropdownPanel.style.display = 'none';
                    }
                }, 200);
            }
        });

        // 监听鼠标进入面板
        dropdownPanel.addEventListener('mouseenter', () => {
            isMouseOverPanel = true;
            clearTimeout(hideTimeout);
        });

        // 监听鼠标离开面板
        dropdownPanel.addEventListener('mouseleave', () => {
            isMouseOverPanel = false;
            // 如果鼠标不在下拉框上，则延迟隐藏
            if (!isMouseOverDropdown) {
                hideTimeout = setTimeout(() => {
                    if (!isMouseOverDropdown && !isMouseOverPanel) {
                        dropdownPanel.style.display = 'none';
                    }
                }, 200);
            }
        });

        // 点击其他地方时，检查鼠标是否在面板或下拉框上
        document.addEventListener('click', (e) => {
            if (!dropdownContainer.contains(e.target as Node)) {
                dropdownPanel.style.display = 'none';
            }
        });

        // 显示已选标签
        this.selectedTags.forEach(tag => {
            this.addSelectedTag(tag, selectedTagsContainer);
        });

        // 创建右侧区域
        const rightArea = this.tagContainer.createDiv('filter-toolbar-right');
        
        // 只在右侧区域创建卡片设置
        this.createCardSettings(rightArea);
    }

    // 添加新方法：创建已选标签
    private addSelectedTag(tag: string, container: HTMLElement) { 
        const tagEl = container.createDiv('selected-tag');
        
        // 标签文本
        tagEl.createSpan({
            text: tag,
            cls: 'tag-text'
        });
        
        // 删除按钮
        const removeBtn = tagEl.createSpan({
            text: '×',
            cls: 'remove-tag'
        });
        
        removeBtn.addEventListener('click', () => {
            this.selectedTags.delete(tag);
            tagEl.remove();
            this.refreshView();
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
            { id: 'month', icon: 'calendar', text: '月历视图' }
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
            iconSpan.innerHTML = iconHtml[view.icon as keyof typeof iconHtml];  // 确类型
            
            // 添加文字
            btn.createSpan({ text: view.text, cls: 'view-switch-text' });
            
            btn.addEventListener('click', () => {
                container.querySelectorAll('.view-switch-btn').forEach(b => b.removeClass('active'));
                btn.addClass('active');
                this.switchView(view.id as 'card' | 'list' | 'timeline' | 'month');
            });
        });
    }

    // 修改 switchView 方法
    private switchView(view: 'card' | 'list' | 'timeline' | 'month') {
        // 如果有正在加载的视图，且不是当前要切换的视图，则中断它
        if (this.currentLoadingView && this.currentLoadingView !== view) {
            console.log(`中断 ${this.currentLoadingView} 视图的加载`);
            this.isLoading = false;
            this.timelineIsLoading = false;
            this.hasMoreNotes = false;
            this.timelineHasMore = false;
        }

        this.currentView = view;
        this.currentLoadingView = view;
        this.container.setAttribute('data-view', view);
        this.container.empty();
        
        const contentSection = this.containerEl.querySelector('.content-section');
        if (contentSection) {
            contentSection.removeClass('view-card', 'view-list', 'view-timeline', 'view-month');
            contentSection.addClass(`view-${view}`);
        }

        // 更新状态栏信息
        let statusMessage = '';
        switch (view) {
            case 'card':
                statusMessage = '切换到卡片视图';
                this.loadNotes();
                break;
            case 'list':
                statusMessage = '切换到列表视图 - 按文件夹分组';
                this.createListView();
                break;
            case 'timeline':
                statusMessage = '切换时间轴视图 - 按日期分组';
                this.createTimelineView();
                break;
            case 'month':
                statusMessage = '切换到月历视图';
                this.createMonthView();
                break;
        }
        this.updateLoadingStatus(statusMessage);
    }

    // 修改 loadNotes 方法
    private async loadNotes() {
        try {
            console.log('开始加载笔记...');
            // 重置分页状态
            this.currentPage = 1;
            this.hasMoreNotes = true;
            this.container.empty();
            
            // 确保加载指示器被添加到容器中
            if (!this.container.contains(this.loadingIndicator)) {
                this.container.appendChild(this.loadingIndicator);
            }
            
            this.loadingIndicator.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">加载中...</div>
            `;
            this.loadingIndicator.style.display = 'flex';
            
            // 加载第一页
            await this.loadNextPage();
            
            // 添加滚动监听
            this.setupInfiniteScroll();
            
            console.log('笔记加载完成');
        } catch (error) {
            console.error('loadNotes 错误:', error);
            new Notice('加载笔记失败，请检查控制台获取详细信息');
        } finally {
            if (this.currentLoadingView === 'card') {
                this.currentLoadingView = null;
            }
        }
    }

    // 修改 loadNextPage 方法
    private async loadNextPage() {
        // 添加视图检查
        if (this.currentView !== 'card') {
            console.log('中断卡片加载：视图已切换');
            return;
        }

        if (this.isLoading || !this.hasMoreNotes) {
            return;
        }
        
        try {
            this.isLoading = true;
            this.updateLoadingStatus('加载中...');
            
            const files = this.app.vault.getMarkdownFiles();
            const filteredFiles = await this.filterFiles(files);
            
            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            const pageFiles = filteredFiles.slice(start, end);
            
            this.hasMoreNotes = end < filteredFiles.length;
            
            // 更新状态栏信息
            this.updateLoadingStatus(`正在加载第 ${this.currentPage} 页 (${start + 1}-${end} / ${filteredFiles.length})`);

            // 创建卡片
            const cards = await Promise.all(
                pageFiles.map(async (file) => {
                    try {
                        return await this.createNoteCard(file);
                    } catch (error) {
                        console.error('创建卡片失败:', file.path, error);
                        return null;
                    }
                })
            );
            
            // 添加卡片到容器
            cards.forEach(card => {
                if (card instanceof HTMLElement) {
                    card.style.width = `${this.cardSize}px`;
                    if (this.loadingIndicator.parentNode === this.container) {
                        this.container.insertBefore(card, this.loadingIndicator);
                    } else {
                        this.container.appendChild(card);
                    }
                }
            });

            // 确保加载指示器始终在底部
            if (this.hasMoreNotes) {
                this.container.appendChild(this.loadingIndicator);
                // 设置加载指示器的最小高度，确保可以触发滚动
                this.loadingIndicator.style.minHeight = '100px';
            }
            
            this.currentPage++;
            
        } catch (error) {
            console.error('loadNextPage 错误:', error);
            this.updateLoadingStatus('加载失败');
            new Notice('加载笔记失败');
        } finally {
            this.isLoading = false;
            if (!this.hasMoreNotes) {
                this.updateLoadingStatus('加载完成');
                this.loadingIndicator.style.display = 'none';
            } else {
                this.loadingIndicator.style.display = 'flex';
            }
        }
    }

    // 添加文件过滤方法
    private async filterFiles(files: TFile[]): Promise<TFile[]> {
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

        return filteredFiles.filter((file): file is TFile => file !== null);
    }

    // 修改 setupInfiniteScroll 方法
    private setupInfiniteScroll() {
        try {
            console.log('设置无限滚动...');
            
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && 
                            !this.isLoading && 
                            this.hasMoreNotes && 
                            this.currentView === 'card') {
                            this.loadNextPage();
                        }
                    });
                },
                {
                    root: this.container,
                    rootMargin: '200px',
                    threshold: 0.1
                }
            );
            
            observer.observe(this.loadingIndicator);
            
            this.container.addEventListener('scroll', () => {
                const { scrollTop, scrollHeight, clientHeight } = this.container;
                const scrollPercentage = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
                
                if (!isNaN(scrollPercentage)) {
                    const scrollStatus = this.statusRight.querySelector('.scroll-status') || createDiv('status-item scroll-status');
                    scrollStatus.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                        <span>${scrollPercentage}%</span>
                    `;
                    if (!this.statusRight.contains(scrollStatus)) {
                        this.statusRight.appendChild(scrollStatus);
                    }
                }
                
                if (this.scrollTimeout) {
                    clearTimeout(this.scrollTimeout);
                }
                
                this.scrollTimeout = setTimeout(() => {
                    const triggerThreshold = 300;
                    if (scrollHeight - scrollTop - clientHeight < triggerThreshold && 
                        !this.isLoading && 
                        this.hasMoreNotes && 
                        this.currentView === 'card') {
                        this.loadNextPage();
                    }
                }, 100);
            });
            
        } catch (error) {
            console.error('setupInfiniteScroll 错误:', error);
        }
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
        
        // 设置卡片宽度和高度
        card.style.width = `${this.cardSize}px`;
        card.style.height = `${this.cardHeight}px`;
        
        // 创建卡片头部
        const header = card.createDiv('note-card-header');
        
        // 添加修改日期
        if (this.cardSettings.showDate) {
            const lastModified = header.createDiv('note-date show'); // 添加 show 类
            lastModified.setText(new Date(file.stat.mtime).toLocaleDateString());
        }

        // 创建文件夹路径
        const folderPath = header.createDiv('note-folder');
        const folder = file.parent ? file.parent.path : '根目录';
        const pathParts = folder === '根目录' ? ['根目录'] : folder.split('/');

        pathParts.forEach((part, index) => {
            if (index > 0) {
                // 只有在非根目录且不是第一个部分时添加分隔符
                folderPath.createSpan({ text: ' / ', cls: 'folder-separator' });
            }
            
            // 创建可点击的文件夹部分
            const folderPart = folderPath.createSpan({
                text: part,
                cls: 'folder-part clickable'
            });
            
            // 获取到这一层的完整路径（对根目录做特殊处理）
            const currentPath = folder === '根目录' ? '' : pathParts.slice(0, index + 1).join('/');
            
            // 添加下划线
            const underline = folderPart.createSpan({ cls: 'folder-underline' });
            
            // 添加悬停效
            folderPart.addEventListener('mouseenter', () => {
                underline.addClass('active');
            });
            
            folderPart.addEventListener('mouseleave', () => {
                underline.removeClass('active');
            });
            
            // 添加点击事件
            folderPart.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // 获取文件浏览器视图
                const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
                if (fileExplorer && fileExplorer.view) {
                    this.app.workspace.revealLeaf(fileExplorer);
                    // 获取对应层级的文件夹
                    const targetFolder = currentPath ? this.app.vault.getAbstractFileByPath(currentPath) : this.app.vault.getRoot();
                    if (targetFolder && (targetFolder instanceof TFolder || !currentPath)) {
                        // 在文件浏览器中定位到该文件夹
                        await (fileExplorer.view as any).revealInFolder(targetFolder);
                    }
                }
            });
        });

        // 添加打开按钮
        const openButton = header.createDiv('note-open-button');
        openButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
        openButton.setAttribute('title', '在新标签页中打开');
        openButton.style.opacity = '0';  // 默认隐藏

        // 创建卡内容容器
        const cardContent = card.createDiv('note-card-content');

        // 处理标题
        const title = cardContent.createDiv('note-title');
        let displayTitle = file.basename;
        const timePattern = /^\d{4}[-./]\d{2}[-./]\d{2}/;
        if (timePattern.test(displayTitle)) {
            displayTitle = displayTitle.replace(timePattern, '').trim();
        }
        
        if (this.currentSearchTerm) {
            title.innerHTML = this.highlightText(displayTitle, this.currentSearchTerm);
        } else {
            title.setText(displayTitle);
        }

        try {
            // 创建笔记内容容器
            const noteContent = cardContent.createDiv('note-content');
            if (this.cardSettings.showContent) {
                noteContent.addClass('show'); // 添加 show 类
            }
            noteContent.setAttribute('data-path', file.path);

            // 添加加载占位符
            const loadingPlaceholder = noteContent.createDiv('content-placeholder');
            loadingPlaceholder.setText('Loading...');

            // 使用 Intersection Observer 监听卡片可见性
            this.observeNoteContent(noteContent, file);

            // 鼠标悬停事件
            card.addEventListener('mouseenter', async () => {
                openButton.style.opacity = '1';
                
                // 根据设置决定是否显示/隐藏内容
                if (!this.cardSettings.showContent) {
                    const noteContent = cardContent.querySelector('.note-content');
                    if (noteContent) {
                        noteContent.addClass('hover-show');
                        
                        // 确保内容已加载
                        if (!this.loadedNotes.has(file.path)) {
                            await this.loadNoteContent(noteContent as HTMLElement, file);
                        }
                    }
                }
                
                // 在预览栏中显示完整内容
                try {
                    this.previewContainer.empty();
                    const content = await this.app.vault.read(file);
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

            // 鼠标离开件
            card.addEventListener('mouseleave', () => {
                openButton.style.opacity = '0';
                
                // 根据设置决定是否隐藏内容
                if (!this.cardSettings.showContent) {
                    const noteContent = cardContent.querySelector('.note-content');
                    if (noteContent) {
                        noteContent.removeClass('hover-show');
                    }
                }
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

            // 双击打
            card.addEventListener('dblclick', async () => {
                await this.openInAppropriateLeaf(file);
            });

            // 右键菜单
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // 如果卡片未被选中，先选它
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

        // 加卡片悬停件
        card.addEventListener('mouseenter', async () => {
            openButton.style.opacity = '1';  // 示打开按钮
            // ... 其他悬停事 ...
        });

        card.addEventListener('mouseleave', () => {
            openButton.style.opacity = '0';  // 隐藏打开按钮
            // ... 其他离事件代码 ...
        });

        // 修改内容显示逻辑
        if (this.cardSettings.showContent) {
            // 创建笔记内容
            const noteContent = cardContent.createDiv('note-content');
            // ... 内容加载逻辑 ...
        }

        return card;
    }

    // 切换预览栏的显示状态
    private togglePreview() {
        this.isPreviewCollapsed = !this.isPreviewCollapsed;
        const previewWrapper = this.containerEl.querySelector('.preview-wrapper');
        
        if (this.isPreviewCollapsed) {
            this.previewContainer.addClass('collapsed');
            previewWrapper?.addClass('collapsed');
            if (previewWrapper instanceof HTMLElement) {
                previewWrapper.style.width = '0px';  // 直接设置宽度为0
            }
            // 调整内容区域宽度
            const contentSection = this.containerEl.querySelector('.content-section');
            if (contentSection instanceof HTMLElement) {
                contentSection.style.width = '100%';
            }
        } else {
            this.previewContainer.removeClass('collapsed');
            previewWrapper?.removeClass('collapsed');
            // 恢复预览栏宽度
            const width = '300px';  // 默认宽度
            if (previewWrapper instanceof HTMLElement) {
                previewWrapper.style.width = width;
            }
            this.previewContainer.style.width = width;
            // 调整内区域
            this.adjustContentWidth();
        }

        // 更新折叠按图标方向
        const toggleButton = this.containerEl.querySelector('.preview-toggle svg');
        if (toggleButton instanceof SVGElement) {  // 修改型检
            toggleButton.style.transform = this.isPreviewCollapsed ? '' : 'rotate(180deg)';
        }
    }

    // 修改预览栏大小调整方法
    private setupResizer() {
        let startX: number;
        let startWidth: number;

        const startResize = (e: MouseEvent) => {
            e.preventDefault();
            startX = e.pageX;
            startWidth = this.previewContainer.offsetWidth;
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
            document.body.style.cursor = 'col-resize';
            this.previewResizer.addClass('resizing');
        };

        const resize = (e: MouseEvent) => {
            if (!startWidth) return;
            const width = startWidth - (e.pageX - startX);
            if (width >= 50 && width <= 800) {
                this.previewContainer.style.width = `${width}px`;
                const previewWrapper = this.containerEl.querySelector('.preview-wrapper');
                if (previewWrapper instanceof HTMLElement) {
                    previewWrapper.style.width = `${width}px`;
                }
                this.adjustContentWidth();
                
                // 如果正在调整大小，确保预览栏是展开的
                if (this.isPreviewCollapsed) {
                    this.isPreviewCollapsed = false;
                    this.previewContainer.removeClass('collapsed');
                    const previewWrapper = this.containerEl.querySelector('.preview-wrapper');
                    previewWrapper?.removeClass('collapsed');
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

    // 调整内容宽度
    private adjustContentWidth() {
        const mainLayout = this.containerEl.querySelector('.main-layout');
        const previewWidth = this.previewContainer.offsetWidth;
        const contentSection = this.containerEl.querySelector('.content-section');
        
        if (mainLayout instanceof HTMLElement && contentSection instanceof HTMLElement) {
            const totalWidth = mainLayout.offsetWidth;
            const newContentWidth = totalWidth - previewWidth - 4; // 4px 是分隔宽度
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
    private async createNewNote(date?: Date) {
            // 获取当前日期作为默认文件名
        const baseFileName = date ? date.toLocaleDateString() : '未命名';
            let fileName = baseFileName;
            let counter = 1;

            // 检查文件名是否已存在
            while (this.app.vault.getAbstractFileByPath(`${fileName}.md`)) {
            const file = this.app.vault.getAbstractFileByPath(`${fileName}.md`);
            if (file instanceof TFile && file.stat.size === 0) {
                // 如果记内容为空，则打开这个笔记
                await this.openInAppropriateLeaf(file);
                return;
            } else {
                fileName = date ? `${baseFileName} ${counter}` : `未命名 ${counter}`;
                counter++;
            }
        }

        try {
            // 创建新笔记
            const file = await this.app.vault.create(
                `${fileName}.md`,
                ''
            );

            // 在新标签页中打开笔记
            // const leaf = this.app.workspace.getLeaf('tab');
            await this.openInAppropriateLeaf(file);

            // 刷新片视图
            this.loadNotes();
        } catch (error) {
            console.error('创建笔记失败:', error);
        }
    }

    // 修改 createQuickNote 方法
    private async createQuickNote(content: string, types: string[], fileName: string): Promise<TFile | null> {
        try {
            // 生成唯一的文件名
            let finalFileName = fileName;
            let counter = 1;
            
            // 检查文件是否存在，如果存在则添加数字后缀
            while (this.app.vault.getAbstractFileByPath(`${finalFileName}.md`)) {
                finalFileName = `${fileName} ${counter}`;
                counter++;
            }

            // 创建笔记文件
            const file = await this.app.vault.create(
                `${finalFileName}.md`,
                content
            );

            if (file) {
                return file;
            }
            
            return null;
        } catch (error) {
            console.error('创建笔记失败:', error);
            new Notice('创建笔记失败');
            return null;
        }
    }

    // 修改 loadTimelinePage 方法
    private async loadTimelinePage(container: HTMLElement) {
        if (this.currentLoadingView !== 'timeline') {
            console.log('中断时间轴视图加载：视图已切换');
            return;
        }

        if (this.timelineIsLoading || !this.timelineHasMore) {
            return;
        }
        
        try {
            this.timelineIsLoading = true;
            this.updateLoadingStatus('加载时间轴...');
            
            // 取所有文件
            const files = this.app.vault.getMarkdownFiles();
            const filteredFiles = await this.filterFiles(files);
            
            // 按日期分组并排序
            const notesByDate = new Map<string, TFile[]>();
            filteredFiles.forEach(file => {
                const date = new Date(file.stat.mtime).toLocaleDateString();
                if (!notesByDate.has(date)) {
                    notesByDate.set(date, []);
                }
                notesByDate.get(date)?.push(file);
            });
            
            const sortedDates = Array.from(notesByDate.keys())
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            
            // 计算分页
            const start = (this.timelineCurrentPage - 1) * this.timelinePageSize;
            const end = start + this.timelinePageSize;
            const pageDates = sortedDates.slice(start, end);
            
            // 检查是否还有更多
            this.timelineHasMore = end < sortedDates.length;
            
            // 更新状态栏信息
            this.updateLoadingStatus(`时间轴视图 - 加载第 ${this.timelineCurrentPage} 页 (${start + 1}-${end} / ${sortedDates.length} 天)`);

            // 使用虚拟滚动技术
            const fragment = document.createDocumentFragment();
            const batchSize = 3; // 每批处理的日期组数
            const batches = Math.ceil(pageDates.length / batchSize);

            for (let i = 0; i < batches; i++) {
                await new Promise<void>(resolve => {
                    window.requestAnimationFrame(async () => {
                        const batchDates = pageDates.slice(i * batchSize, (i + 1) * batchSize);
                        
                        for (const date of batchDates) {
                            const dateGroup = document.createElement('div');
                            dateGroup.className = 'timeline-date-group';
                            
                            // 创建日期节点（使用innerHTML提高性能）
                            dateGroup.innerHTML = `
                                <div class="timeline-date-node">
                                    <div class="timeline-node-circle"></div>
                                    <div class="timeline-date-label">${date}</div>
                                </div>
                                <div class="timeline-notes-list"></div>
                            `;

                            const notesList = dateGroup.querySelector('.timeline-notes-list') as HTMLElement;
                            const notes = notesByDate.get(date) || [];
                            
                            // 批量创建卡片的占位符
                            const cardPromises = notes.map(async (file) => {
                                const placeholder = document.createElement('div');
                                placeholder.className = 'note-card-placeholder';
                                placeholder.style.width = '100%';
                                placeholder.style.height = '200px'; // 设置一固定高度
                                placeholder.style.backgroundColor = 'var(--background-secondary)';
                                placeholder.style.borderRadius = '8px';
                                placeholder.style.marginBottom = '1rem';
                                notesList.appendChild(placeholder);

                                // 异步创建实际的卡片
                                const card = await this.createNoteCard(file);
                                if (card instanceof HTMLElement) {
                                    card.style.width = '100%';
                                    // 只有在当前视图仍然是时间轴时才替换占位符
                                    if (this.currentView === 'timeline') {
                                        notesList.replaceChild(card, placeholder);
                                    }
                                }
                            });

                            // 添加日组到档片段
                            fragment.appendChild(dateGroup);
                            
                            // 异步处理卡片创建
                            Promise.all(cardPromises).catch(error => {
                                console.error('创建卡片失败:', error);
                            });
                        }
                        resolve();
                    });
                });
            }

            // 一次添加所有内到容器
            container.appendChild(fragment);
            
            this.timelineCurrentPage++;
            
        } catch (error) {
            console.error('加载时间轴页面失败:', error);
            this.updateLoadingStatus('加载失败');
        } finally {
            this.timelineIsLoading = false;
            if (this.currentLoadingView === 'timeline') {
                this.currentLoadingView = null;
            }
        }
    }

    // 添时间轴滚动听方法
    private setupTimelineScroll(container: HTMLElement) {
        try {
            console.log('设置时间轴滚监听...');
            
            // 使用 Intersection Observer 监听加载指示器
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && !this.timelineIsLoading && this.timelineHasMore) {
                            console.log('触发时间轴加载更多');
                            this.loadTimelinePage(container);
                        }
                    });
                },
                {
                    root: container,
                    rootMargin: '100px',
                    threshold: 0.1
                }
            );
            
            observer.observe(this.timelineLoadingIndicator);
            console.log('已添加时间轴 Intersection Observer');
            
            // 添加滚动事件处理
            container.addEventListener('scroll', () => {
                const { scrollTop, scrollHeight, clientHeight } = container;
                if (scrollHeight - scrollTop - clientHeight < 100 && !this.timelineIsLoading && this.timelineHasMore) {
                    console.log('滚动触发时间轴加载更多');
                    this.loadTimelinePage(container);
                }
            });
            
            console.log('已添加时轴滚动事件监听');
            
        } catch (error) {
            console.error('设置时间轴滚动监听失败:', error);
        }
    }

    // 刷新视图（用于搜索和过滤）
    private async refreshView() {
        // 重置状态
        this.currentPage = 1;
        this.hasMoreNotes = true;
        this.loadedNotes.clear();
        
        // 断开之前的观察器
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        
        this.container.empty();
        
        // 重新创建加载指示器
        this.loadingIndicator.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">加载中...</div>
        `;
        this.loadingIndicator.style.display = 'none';
        
        // 加载第一页
        await this.loadNextPage();
        
        // 重新设置无限滚动
        this.setupInfiniteScroll();
        
        this.updateLoadingStatus('刷新视图...');
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

    // 清除标签选择
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

    // 获选中的文件
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
                    .setTitle(`文件列表中显示`)
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
                            `是否确定要删除选中的 ${files.length} 个件？`
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

    // 添调整卡片高度的法
    private adjustCardHeight(delta: number) {
        const adjustment = delta > 0 ? -10 : 10;
        const newHeight = Math.max(
            this.plugin.settings.minCardHeight ?? 0,
            Math.min(this.plugin.settings.maxCardHeight ?? Infinity, this.cardHeight + adjustment)
        );

        if (newHeight !== this.cardHeight) {
            this.cardHeight = newHeight;
            this.updateCardHeight(newHeight);
            // 使用新添加的方法保存高度
            this.plugin.saveCardHeight(newHeight);
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

    // 添加更新卡片高度的方
    private updateCardHeight(height: number) {
        this.cardHeight = height;
        // 更新所有卡片的高度
        this.container.querySelectorAll('.note-card').forEach((card: Element) => {
            if (card instanceof HTMLElement) {
                card.style.height = `${height}px`;
            }
        });
    }

    // 创建日历钮
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

    // 切换日历显示状态
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

    // 添加按月份过滤的法
    private filterNotesByMonth(date: Date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        this.currentFilter = { 
            type: 'date', 
            value: `${year}-${(month + 1).toString().padStart(2, '0')}` 
        };
        this.refreshView();
    }

    // 显示历
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
            
            // 将日历容器入到 main-layout 的开头
            mainLayout.insertBefore(this.calendarContainer, mainLayout.firstChild);
            
            console.log('历容器已创建:', this.calendarContainer);
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

    // 隐日历 
    private hideCalendar() {
        console.log('隐藏日历');
        
        if (this.calendarContainer) {
            this.calendarContainer.style.display = 'none';
            this.calendarContainer.empty();
            
            // 移除 with-calendar 类
            const mainLayout = this.containerEl.querySelector('.main-layout');
            if (mainLayout) {
                mainLayout.removeClass('with-calendar');
                console.log('已移除 with-calendar ');
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
        
        // 建日历头部
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
        
        // 示年月
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

        // 创建日网格
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

    // 清除日期过滤
    private clearDateFilter() {
        this.currentFilter = { type: 'none' };
        // 清除所有日期选中状态
        if (this.calendarContainer) {
            this.calendarContainer.querySelectorAll('.calendar-day').forEach(day => {
                day.removeClass('selected');
            });
        }
        // 刷新图显示所有笔记
        this.refreshView();
    }


   // 打开文件
    private async openInAppropriateLeaf(file: TFile, openFile: boolean = true) {
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (fileExplorer) {
            this.app.workspace.revealLeaf(fileExplorer);  // 如果文件浏览器已经在，直接活它
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
  
    }

    // 高亮文本
    private highlightText(text: string, searchTerm: string): string {
        if (!searchTerm || searchTerm.trim() === '') {
            return text; // 如果搜索词为空，直接返回原文本
        }
        
        const escapedSearchTerm = searchTerm
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 转特殊字符
            .trim(); // 确保去除空格
        
        const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    }

    // 文件内容搜索
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

    // 创建命令按钮
    private createCommandButton(toolbar: HTMLElement) {
        const commandContainer = toolbar.createDiv('command-container');
        
        // 创建命按
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
            console.log('批量重命名功能实现');
        });

        // 使用击事替代鼠标悬停事件
        let isMenuVisible = false;
        
        // 点击按钮时换菜单显示状态
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

    // 删除空白笔记
    private async deleteEmptyNotes() {
        const selectedFiles = this.getSelectedFiles();
        if (selectedFiles.length === 0) {
            // 如果没有选中的笔记，提用户
            new Notice('请先选择检查的笔记');
            return;
        }

        // 检查空白笔记
        const emptyNotes: TFile[] = [];
        for (const file of selectedFiles) {
            const content = await this.app.vault.read(file);
            // 移除所空白字符后检查是否为空
            if (!content.trim()) {
                emptyNotes.push(file);
            }
        }

        if (emptyNotes.length === 0) {
            new Notice('所选笔记中没有空白笔记');
            return;
        }

        // 示确认对话框
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
            new Notice(`删除 ${emptyNotes.length} 个空白笔记`);
        }
    }

    // 创建月视图
    private async createMonthView() {
        if (this.currentLoadingView !== 'month') {
            console.log('中断月历视图加载：视图已切换');
            return;
        }

        try {
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
                    
                    // 添加点击事
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
        } finally {
            if (this.currentLoadingView === 'month') {
                this.currentLoadingView = null;
            }
        }
    }

    // 选择月份
    private selectMonth(month: number) {
        this.currentDate = new Date(this.currentDate.getFullYear(), month);
        this.updateMonthView();
    }

    // 更新月视图
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

   // 月份导航
    private navigateMonth(delta: number) {
        const newDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + delta);
        
        // 如果年份变化，需要新年份显示
        if (newDate.getFullYear() !== this.currentDate.getFullYear()) {
            const yearDisplay = this.container.querySelector('.year-display');
            if (yearDisplay) {
                yearDisplay.setText(newDate.getFullYear().toString());
            }
        }
        
        this.currentDate = newDate;
        this.updateMonthView();
    }

    // 跳转到今天
    private goToToday() {
        this.currentDate = new Date();
        this.updateMonthView();
    }

    // 渲染月视图网格
    private renderMonthGrid(grid: HTMLElement) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        // 获取今天日期
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

   // 获取定月份笔记
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

    // 格式化月份标题
    private formatMonthTitle(date: Date): string {
        return `${date.getFullYear()}${date.getMonth() + 1}月`;
    }

    // 年份航
    private navigateYear(delta: number) {
        this.currentDate = new Date(this.currentDate.getFullYear() + delta, this.currentDate.getMonth());
        this.updateMonthView();
    }

    // 创建列表视图
    private async createListView() {
        if (this.currentLoadingView !== 'list') {
            console.log('中列表视图加载：视图已切换');
            return;
        }

        try {
            const files = this.app.vault.getMarkdownFiles();
            const folderStructure = new Map<string, Map<string, TFile[]>>();
            
            // 构建文件夹结构和分组笔记
            files.forEach(file => {
                const pathParts = file.path.split('/');
                const rootFolder = pathParts.length > 1 ? pathParts[0] : '根录';
                const subFolder = pathParts.length > 2 ? pathParts[1] : '';
                
                // 初始化根文件夹结构
                if (!folderStructure.has(rootFolder)) {
                    folderStructure.set(rootFolder, new Map());
                }
                
                // 将笔记添加到对的文件夹中
                const subFolders = folderStructure.get(rootFolder);
                if (subFolders) {
                    if (!subFolders.has(subFolder)) {
                        subFolders.set(subFolder, []);
                    }
                    subFolders.get(subFolder)?.push(file);
                }
            }); // 这里添加逗号
            
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
                    const rootTitle = sideNav.createDiv('folder-title');
                    rootTitle.setText('...');//当前目录
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
                
                // 建右侧笔记域
                const notesArea = contentArea.createDiv('folder-content');
                
                // 默认显示文件夹的笔
                this.showFolderContent(notesArea, rootNotes);
            }
        } finally {
            if (this.currentLoadingView === 'list') {
                this.currentLoadingView = null;
            }
        }
    }

    // 显示文件夹内容
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
            
            // 添加修日期
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

        // 右菜单
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

    // 在 CardView 类中添加新的方法来处理滚动同步
    private setupScrollSync() {
        // 获取卡片容器和预览容器
        const cardContainer = this.container;
        const previewContainer = this.previewContainer;

        // 为卡片容器添加滚动事件监听
        cardContainer.addEventListener('wheel', (e: WheelEvent) => {
            // 如果按住了 Ctrl 或 Shift 键，不处理滚动同步（因为这是用来调整卡片大小的）
            if (e.ctrlKey || e.shiftKey) {
                return;
            }

            // 添加滚动时的鼠标样式
            cardContainer.style.cursor = 'ns-resize';

            // 设置定时器来恢复鼠标样式
            setTimeout(() => {
                cardContainer.style.cursor = 'default';
            }, 150);

            // 同步览容器的滚动位置
            previewContainer.scrollTop += e.deltaY;
        });

        // 预览容器添加滚动事件监听
        previewContainer.addEventListener('wheel', (e: WheelEvent) => {
            // 添加滚动时的鼠标样式
            previewContainer.style.cursor = 'ns-resize';

            // 设置定时器来恢复鼠标样式
            setTimeout(() => {
                previewContainer.style.cursor = 'default';
            }, 150);
        });
    }

    private setupQuickNoteEvents(
        input: HTMLTextAreaElement,
        toolbar: HTMLElement,
        tagSuggestions: HTMLElement
    ) {
        // 使用已存在的 titleInput
        const titleInput = input.parentElement?.querySelector('.quick-note-title') as HTMLInputElement;

        // 使用已存在的标签容器和输入框
        const tagsContainer = input.parentElement?.querySelector('.tags-container') as HTMLElement;
        const tagInput = tagsContainer?.querySelector('.tag-input') as HTMLInputElement;

        // 将标题输入框移到最前
        if (titleInput && input.parentElement) {
            input.parentElement.insertBefore(titleInput, input.parentElement.firstChild);
        }

        // 存储最近使用的标签并初始化显示
        const recentTags = new Set<string>(this.loadRecentTags());
        const tags = new Set<string>();

        // 初始化显示最近使用的标签
        recentTags.forEach(tag => {
            const tagItem = tagsContainer?.createDiv('tag-item');
            tagItem?.addClass('recent-tag');
            tagItem?.setText(tag);
            
            // 为最近使用的标签也添加删除按钮
            const removeBtn = tagItem?.createDiv('remove-tag');
            removeBtn?.setText('×');
            removeBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                recentTags.delete(tag);
                tagItem?.remove();
                this.saveRecentTags(Array.from(recentTags));
            });
            
            tags.add(tag);
            if (tagInput) tagInput.value = '';
        });

        // 修改添加标签的方法
        const addTag = (tagText: string) => {
            if (!tagText || tags.has(tagText)) return;
            
            const tagItem = tagsContainer?.createDiv('tag-item');
            tagItem?.setText(tagText);
            
            // 为所有标签添加删除按钮，包括最近使用的标签
            const removeBtn = tagItem?.createDiv('remove-tag');
            removeBtn?.setText('×');
            removeBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                tags.delete(tagText);
                tagItem?.remove();
                // 将移除的标签添加到最近使用
                recentTags.add(tagText);
                this.saveRecentTags(Array.from(recentTags));
            });
            
            tags.add(tagText);
            if (tagInput) tagInput.value = '';
        };

        // 修改最近签的处理
        recentTags.forEach(tag => {
            const tagItem = tagsContainer?.createDiv('tag-item');
            tagItem?.addClass('recent-tag');
            tagItem?.setText(tag);
            
            // 为最近使用的标签也添加删除按钮
            const removeBtn = tagItem?.createDiv('remove-tag');
            removeBtn?.setText('×');
            removeBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                recentTags.delete(tag);
                tagItem?.remove();
                this.saveRecentTags(Array.from(recentTags));
            });

            // 点击最近标签时添加到当前标签
            tagItem?.addEventListener('click', () => {
                if (tagItem.hasClass('recent-tag')) {
                    tagItem.remove();
                    addTag(tag);
                    recentTags.delete(tag);
                    this.saveRecentTags(Array.from(recentTags));
                }
            });
        });

        // 处理代码高亮
        input.addEventListener('input', () => {
            const content = input.value;
            if (content.includes('```')) {
                input.addClass('has-code');
                // 使用 Prism.js 或其他语法高亮库处理代码块
                // 这里需要添加具体的代码高亮逻辑
            } else {
                input.removeClass('has-code');
            }
        });

        // 修改 handleSendNote 函数的实现
        const handleSendNote = async () => {
            const title = titleInput?.value?.trim();
            const content = input.value.trim();
            
            if (!content) {
                new Notice('请输入笔记内容');
                return;
            }

            try {
                // 获取所有已添加的标签
                const tagItems = tagsContainer?.querySelectorAll('.tag-item.active') ?? [];
                const tagTexts = Array.from(tagItems).map(item => item.textContent?.replace('×', '').trim() ?? '');
                
                // 构建笔记内容，只包含激活的标签
                const tagsContent = tagTexts.map(tag => `#${tag}`).join(' ');
                const finalContent = tagsContent ? `${tagsContent}\n\n${content}` : content;
                
                // 使用标题作为文件名
                const fileName = title || new Date().toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }).replace(/\//g, '-');

                // 创建笔记
                const file = await this.createQuickNote(finalContent, [], fileName);
                
                if (file) {
                    // 清理输入状态，但保留标签
                    this.clearQuickNoteInputs(titleInput ?? null, input, tags, tagsContainer ?? null, tagInput ?? null);
                    
                    // 将所有标签设置为未选中状态
                    tagsContainer?.querySelectorAll('.tag-item').forEach(item => {
                        item.removeClass('active');
                        item.addClass('inactive');
                    });
                    
                    // 刷视图
                    await this.refreshView();
                    
                    new Notice('笔记创建成功');
                }
            } catch (error) {
                console.error('创建笔记失败:', error);
                new Notice('创建笔记失败');
            }
        };

        // 修改发送按钮的事件绑定
        const sendButton = input.parentElement?.querySelector('.quick-note-send');
        if (sendButton) {
            sendButton.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await handleSendNote();
            });
        }

        // 修改 Enter 键处理
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await handleSendNote();
            }
        });

        // 修改标签入处理
        if (tagInput) {
            tagInput.addEventListener('keydown', (e) => {
                if (e.key === ' ' && tagInput.value.trim()) {
                    e.preventDefault();
                    const tagText = tagInput.value.trim();
                    
                    // 添加标签（默认为高亮状态）
                    if (tagText && !tags.has(tagText)) {
                        const tagItem = tagsContainer?.createDiv('tag-item');
                        tagItem?.addClass('active'); // 默认为亮状态
                        tagItem?.setText(tagText);
                        
                        // 添加删除按钮
                        const removeBtn = tagItem?.createDiv('remove-tag');
                        removeBtn?.setText('×');
                        removeBtn?.addEventListener('click', (e) => {
                            e.stopPropagation();
                            tags.delete(tagText);
                            tagItem?.remove();
                        });
                        
                        // 添加点击切换状态事件
                        tagItem?.addEventListener('click', (e) => {
                            if (e.target !== removeBtn) {
                                tagItem.toggleClass('active', !tagItem.hasClass('active')); // 添加第二个参数
                                tagItem.toggleClass('inactive', tagItem.hasClass('active')); // 添加第二个参数
                            }
                        });
                        
                        tags.add(tagText);
                        tagInput.value = '';
                    }
                }
            });
        }
    }

    // 添加清理输入状态的辅助方法
    private clearQuickNoteInputs(
        titleInput: HTMLInputElement | null,
        contentInput: HTMLTextAreaElement,
        tags: Set<string>,
        tagsContainer: HTMLElement | null,
        tagInput: HTMLInputElement | null
    ) {
        // 清标题
        if (titleInput) {
            titleInput.value = '';
        }

        // 清除内容
        contentInput.value = '';
        contentInput.style.height = '24px';
        contentInput.style.overflowY = 'hidden';

        // 重置工具栏按钮状态
        const toolbar = contentInput.closest('.quick-note-bar')?.querySelector('.quick-note-toolbar');
        if (toolbar) {
            toolbar.querySelectorAll('.quick-note-btn').forEach(btn => {
                btn.removeClass('active');
            });
        }
    }

    // 高亮新笔记
    private highlightNewNote(path: string) {
        const noteCard = this.container.querySelector(`[data-path="${path}"]`);
        if (noteCard) {
            noteCard.addClass('highlight');
            // 5秒后移除高亮
            setTimeout(() => {
                noteCard.removeClass('highlight');
            }, 5000);
        }
    }

    // 修改 setupDraggable 方法
    private setupDraggable(element: HTMLElement) {
        let isDragging = false;
        let offsetX: number;
        let offsetY: number;
        let startX: number;
        let startY: number;
        let isClick = true; // 新增变量，用于判断是否为点击事件

        const dragStart = (e: MouseEvent) => {
            // 检查是否应该允许拖拽
            const target = e.target as HTMLElement;
            if (!element.hasClass('minimized') && (
                target.closest('.quick-note-input') || 
                target.closest('.quick-note-btn') || 
                target.closest('.control-button') ||
                target.closest('.quick-note-send') ||
                target.closest('.tag-input') ||
                target.closest('.quick-note-title')
            )) {
                return;
            }

            isDragging = true;
            isClick = true; // 初始状态设为点击
            startX = e.clientX;
            startY = e.clientY;

            // 获取各种位置信息
            const elementRect = element.getBoundingClientRect();
            const workspaceLeafContent = this.containerEl.closest('.workspace-leaf-content');
            
            offsetX = e.clientX - elementRect.left;
            offsetY = e.clientY - elementRect.top;
            
            element.style.transition = 'none';
            element.style.cursor = 'grabbing';
            element.addClass('dragging');
            
            e.preventDefault();
            e.stopPropagation();
        };

        const drag = (e: MouseEvent) => {
            if (!isDragging) return;
            
            // 计算动距离
            const moveX = Math.abs(e.clientX - startX);
            const moveY = Math.abs(e.clientY - startY);
            
            // 如果移动超过阈值，则不是点击
            if (moveX > 5 || moveY > 5) {
                isClick = false;
            }
            
            e.preventDefault();
            e.stopPropagation();
            
            const workspaceLeafContent = this.containerEl.closest('.workspace-leaf-content');
            if (!workspaceLeafContent) return;
            
            const leafRect = workspaceLeafContent.getBoundingClientRect();
            const newX = e.clientX - leafRect.left - offsetX;
            const newY = e.clientY - leafRect.top - offsetY;

            const maxX = (workspaceLeafContent as HTMLElement).offsetWidth - (element as HTMLElement).offsetWidth;
            const maxY = (workspaceLeafContent as HTMLElement).offsetHeight - (element as HTMLElement).offsetHeight;
            
            const boundedX = Math.max(0, Math.min(newX, maxX));
            const boundedY = Math.max(0, Math.min(newY, maxY));

            element.style.left = `${boundedX}px`;
            element.style.top = `${boundedY}px`;
            element.style.transform = 'none';
        };

        const dragEnd = (e: MouseEvent) => {
            if (!isDragging) return;
            
            isDragging = false;
            element.style.transition = 'all 0.2s ease';
            element.style.cursor = element.hasClass('minimized') ? 'grab' : 'default';
            element.removeClass('dragging');
            
            // 只有在最小化状态下且是点击时才展开
            if (element.hasClass('minimized') && isClick) {
                this.restoreQuickNote(element);
            }
            
            e.stopPropagation();
        };

  
        element.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        const resizeObserver = new ResizeObserver(() => {
            if (!isDragging && !element.hasClass('minimized')) {
                element.style.left = '50%';
                element.style.top = '20px';
                element.style.transform = 'translateX(-50%)';
            }
        });
        
        const workspaceLeafContent = this.containerEl.closest('.workspace-leaf-content');
        if (workspaceLeafContent) {
            resizeObserver.observe(workspaceLeafContent);
        }

        element.addEventListener('selectstart', (e) => {
            if (isDragging) {
                e.preventDefault();
            }
        });
    }

    // 修改 toggleMinimize 方法
    private toggleMinimize(element: HTMLElement) {
        const isMinimized = element.hasClass('minimized');
        const rect = element.getBoundingClientRect();
        
        if (isMinimized) {
            // 恢复正常状态
            // 保存当前左上角位置
            const currentLeft = rect.left;
            const currentTop = rect.top;
            
            // 先移除最小化类
            element.removeClass('minimized');
            
            // 设置展开尺寸和位置
            element.style.width = '800px';
            element.style.removeProperty('height');
            element.style.left = `${currentLeft}px`;
            element.style.top = `${currentTop}px`;
            element.style.transform = 'none';
            
        } else {
            // 最小化状态
            // 保存当前左上角位置
            const currentLeft = rect.left;
            const currentTop = rect.top;
            
            // 设置最小化尺寸和位置
            element.style.width = '40px';
            element.style.height = '40px';
            element.style.left = `${currentLeft}px`;
            element.style.top = `${currentTop}px`;
            element.style.transform = 'none';
            
            // 最后添加最小化类
            element.addClass('minimized');
        }
    }

    // 添加保存和加载近标签的方法
    private saveRecentTags(tags: string[]) {
        localStorage.setItem('recent-tags', JSON.stringify(tags));
    }

    private loadRecentTags(): string[] {
        const saved = localStorage.getItem('recent-tags');
        return saved ? JSON.parse(saved) : [];
    }

    // 修改 minimizeQuickNote 和 restoreQuickNote 方法
    private minimizeQuickNote(element: HTMLElement) {
        const workspaceLeafContent = this.containerEl.closest('.workspace-leaf-content');
        if (!workspaceLeafContent) return;
        
        const leafRect = workspaceLeafContent.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const position = this.getQuickNotePosition(element);
        
        // 计算相对于 workspace-leaf-content 的位置
        const relativeLeft = elementRect.left - leafRect.left;
        const relativeTop = elementRect.top - leafRect.top;
        
        // 设最小化尺寸
        const minimizedSize = 40;
        element.style.width = `${minimizedSize}px`;
        element.style.height = `${minimizedSize}px`;
        
        // 根据位置计算最小化后的位置
        switch (position) {
            case 'top-right':
                element.style.left = `${relativeLeft + (element.offsetWidth - minimizedSize)}px`;
                element.style.top = `${relativeTop}px`;
                break;
            case 'top-left':
                element.style.left = `${relativeLeft}px`;
                element.style.top = `${relativeTop}px`;
                break;
            case 'bottom-right':
                element.style.left = `${relativeLeft + (element.offsetWidth - minimizedSize)}px`;
                element.style.top = `${relativeTop}px`;
                break;
            case 'bottom-left':
                element.style.left = `${relativeLeft}px`;
                element.style.top = `${relativeTop}px`;
                break;
            default:
                // 居中最小化
                element.style.left = '50%';
                element.style.transform = 'translateX(-50%)';
        }
        
        // 添加最小化类
        element.addClass('minimized');

        // 移除背景模糊
        const backdrop = this.containerEl.querySelector('.quick-note-backdrop');
        backdrop?.removeClass('active');
    }

    // 恢快速笔记
    private restoreQuickNote(element: HTMLElement) {
        if (!element.hasClass('minimized')) return;
        
        const workspaceLeafContent = this.containerEl.closest('.workspace-leaf-content');
        if (!workspaceLeafContent) return;
        
        const leafRect = workspaceLeafContent.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const position = this.getQuickNotePosition(element);
        
        // 移除最小化类
        element.removeClass('minimized');
        
        // 设置展开尺寸
        element.style.width = '800px';
        element.style.removeProperty('height');
        
        // 计算相对于 workspace-leaf-content 的位置
        const relativeLeft = elementRect.left - leafRect.left;
        const relativeTop = elementRect.top - leafRect.top;
        
        // 根据位置计算展开后的位置
        switch (position) {
            case 'top-right':
                element.style.left = `${relativeLeft - (800 - 40)}px`; // 800是展开宽度,40是最小化宽度
                element.style.top = `${relativeTop}px`;
                break;
            case 'top-left':
                element.style.left = `${relativeLeft}px`;
                element.style.top = `${relativeTop}px`;
                break;
            case 'bottom-right':
                element.style.left = `${relativeLeft - (800 - 40)}px`;
                element.style.top = `${relativeTop}px`;
                break;
            case 'bottom-left':
                element.style.left = `${relativeLeft}px`;
                element.style.top = `${relativeTop}px`;
                break;
            default:
                // 居中展开
                element.style.left = '50%';
                element.style.top = '20px';
                element.style.transform = 'translateX(-50%)';
        }

        // 激活背景模糊
        const backdrop = this.containerEl.querySelector('.quick-note-backdrop');
        backdrop?.addClass('active');
    }

    // 添加更新高亮标签的方法
    private updateHighlightedTags() {
        // 获取所有标按钮
        const tagButtons = this.tagContainer.querySelectorAll('.tag-btn');
        
        // 清除所有高亮
        tagButtons.forEach(btn => {
            btn.removeClass('highlighted');
        });
        
        // 高亮匹配的标签
        tagButtons.forEach(btn => {
            const tagText = btn.textContent?.split(' ')[0];  // 获取标签文本（排除计数）
            if (tagText && this.selectedTags.has(tagText)) {
                btn.addClass('highlighted');
            }
        });
    }

    // 修改 addTag 方法
    private addTag(tagText: string, tags: Set<string>, tagsContainer: HTMLElement) {
        if (!tagText || tags.has(tagText)) return;
        
        const tagItem = tagsContainer.createDiv('tag-item');
        tagItem.setText(tagText);
        
        const removeBtn = tagItem.createDiv('remove-tag');
        removeBtn.setText('×');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            tags.delete(tagText);
            tagItem.remove();
            this.updateHighlightedTags();  // 更新高亮显示
        });
        
        tags.add(tagText);
        this.updateHighlightedTags();  // 更新高显示
    }

    // 添加位置判断方法
    private getQuickNotePosition(element: HTMLElement) {
        const workspaceLeafContent = this.containerEl.closest('.workspace-leaf-content');
        if (!workspaceLeafContent) return 'center';

        const leafRect = workspaceLeafContent.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        // 计算元素中心点
        const centerX = elementRect.left + elementRect.width / 2;
        const centerY = elementRect.top + elementRect.height / 2;
        
        // 计算相对位置
        const isRight = centerX > leafRect.left + leafRect.width / 2;
        const isBottom = centerY > leafRect.top + leafRect.height / 2;
        
        if (isRight && !isBottom) return 'top-right';
        if (!isRight && !isBottom) return 'top-left';
        if (isRight && isBottom) return 'bottom-right';
        if (!isRight && isBottom) return 'bottom-left';
        return 'center';
    }

    // 添加观察笔记内容的方法
    private observeNoteContent(element: HTMLElement, file: TFile) {
        if (this.intersectionObserver) {
            this.intersectionObserver.observe(element);
        }
    }

    // 添加加载笔记内容的方法
    private async loadNoteContent(container: HTMLElement, file: TFile) {
        if (this.loadedNotes.has(file.path)) return;
        
        try {
            container.empty(); // 清除加载位符
            
            const content = await this.app.vault.read(file);
            await MarkdownRenderer.render(
                this.app,
                content,
                container,
                file.path,
                this
            );
            
            // 如果有搜索词，处理高亮
            if (this.currentSearchTerm) {
                const contentElements = container.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
                contentElements.forEach(element => {
                    const originalText = element.textContent || '';
                    if (originalText.toLowerCase().includes(this.currentSearchTerm.toLowerCase())) {
                        element.innerHTML = this.highlightText(originalText, this.currentSearchTerm);
                    }
                });
            }
            
            this.loadedNotes.add(file.path);
            console.log('加载笔记内容成功:', file.path);
        } catch (error) {
            console.error('加载笔记内容失败:', error);
            container.setText('加载失败');
        }
    }

    // 修改 onClose 方法
    async onClose() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        this.loadedNotes.clear();
        // ... 其他清理代码 ...
    }

    // 添加更新状态栏的方法
    private updateLoadingStatus(message: string) {
        if (!this.loadingStatus) return;
        
        const loadingIndicator = this.loadingStatus.querySelector('.loading-indicator');
        if (this.isLoading) {
            // 加载中状态
            loadingIndicator?.addClass('loading');
            this.loadingStatus.innerHTML = `
                <div class="loading-indicator loading">
                    <div class="loading-spinner"></div>
                    <span>${message}</span>
                </div>
            `;
        } else {
            // 加载完成状态 - 不显示加载动画
            loadingIndicator?.removeClass('loading');
            this.loadingStatus.innerHTML = `
                <div class="loading-indicator">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span>${message}</span>
                </div>
            `;
        }
    }

    // 添加 createTimelineView 方法
    private async createTimelineView() {
        try {
            // 清除容器内容
            this.container.empty();
            
            console.log('开始创建时间轴视图...');
            const timelineContainer = this.container.createDiv('timeline-container');
            
            // 初始化加载指示器
            this.timelineLoadingIndicator.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">加载中...</div>
            `;
            this.timelineLoadingIndicator.style.display = 'none';
            timelineContainer.appendChild(this.timelineLoadingIndicator);
            
            // 重置分页状态
            this.timelineCurrentPage = 1;
            this.timelineHasMore = true;
            this.timelineIsLoading = false;
            
            // 加载第一页
            await this.loadTimelinePage(timelineContainer);
            
            // 设置滚动监听
            this.setupTimelineScroll(timelineContainer);
            
        } catch (error) {
            console.error('创建时间轴视图失败:', error);
            new Notice('创建时间轴视图失败');
            this.updateLoadingStatus('创建时间轴视图失败');
        }
    }

    // 在 createViewSwitcher 方法后添加新的方法
    private createCardSettings(toolbar: HTMLElement) {
        const settingsContainer = toolbar.createDiv('card-settings-container');
        
        // 创建设置按钮
        const settingsBtn = settingsContainer.createEl('button', {
            cls: 'card-settings-button',
        });
        settingsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <span>卡片设置</span>
        `;

        // 创建设置面板
        const settingsPanel = settingsContainer.createDiv('card-settings-panel');
        settingsPanel.style.display = 'none';

        // 添加基本设置选项
        const basicSettings = settingsPanel.createDiv('settings-section');
        basicSettings.createEl('h3', { text: '基本设置' });

        // 显示日期选项
        const showDateOption = this.createCheckboxOption(basicSettings, '显示日期', this.cardSettings.showDate);
        showDateOption.addEventListener('change', (e) => {
            this.cardSettings.showDate = (e.target as HTMLInputElement).checked;
            this.refreshView();
        });

        // 显示内容选项
        const showContentOption = this.createCheckboxOption(basicSettings, '显示笔记内容', this.cardSettings.showContent);
        showContentOption.addEventListener('change', (e) => {
            this.cardSettings.showContent = (e.target as HTMLInputElement).checked;
            this.refreshView();
        });

        // 添加布局设置
        const layoutSettings = settingsPanel.createDiv('settings-section');
        layoutSettings.createEl('h3', { text: '布局设置' });

        // 卡片宽度设置
        this.createSliderOption(layoutSettings, '卡片宽度', this.cardSettings.cardWidth, 200, 500, 10, (value) => {
            this.cardSettings.cardWidth = value;
            this.updateCardLayout();
        });

        // 卡片高度设置
        this.createSliderOption(layoutSettings, '卡片高度', this.cardSettings.cardHeight, 200, 500, 10, (value) => {
            this.cardSettings.cardHeight = value;
            this.updateCardLayout();
        });

        // 卡片间距设置
        this.createSliderOption(layoutSettings, '卡片间距', this.cardSettings.cardGap, 8, 40, 4, (value) => {
            this.cardSettings.cardGap = value;
            this.updateCardLayout();
        });

        // 每行卡片数量设置
        const cardsPerRowContainer = layoutSettings.createDiv('setting-item');
        cardsPerRowContainer.createEl('label', { text: '每行卡片数量' });
        
        // 创建控制组
        const controlGroup = cardsPerRowContainer.createDiv('setting-control-group');
        
        // 减少按钮
        const decreaseBtn = controlGroup.createEl('button', {
            cls: 'cards-per-row-btn decrease',
            text: '-'
        });
        
        // 数字输入框
        const cardsPerRowInput = controlGroup.createEl('input', {
            type: 'number',
            value: this.cardSettings.cardsPerRow.toString(),
            placeholder: '自动'
        });
        
        // 增加按钮
        const increaseBtn = controlGroup.createEl('button', {
            cls: 'cards-per-row-btn increase',
            text: '+'
        });

        // 更新卡片布局的函数
        const updateCardsPerRow = (value: number) => {
            // 确保值在合理范围内（0表示自动，最大10列）
            value = Math.max(0, Math.min(10, value));
            cardsPerRowInput.value = value.toString();
            this.cardSettings.cardsPerRow = value;
            this.updateCardLayout();
        };

        // 添加按钮事件
        decreaseBtn.addEventListener('click', () => {
            const currentValue = parseInt(cardsPerRowInput.value) || 0;
            updateCardsPerRow(currentValue - 1);
        });

        increaseBtn.addEventListener('click', () => {
            const currentValue = parseInt(cardsPerRowInput.value) || 0;
            updateCardsPerRow(currentValue + 1);
        });

        // 输入框事件
        cardsPerRowInput.addEventListener('change', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            updateCardsPerRow(isNaN(value) ? 0 : value);
        });

        // 切换面板显示
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = settingsPanel.style.display === 'block';
            settingsPanel.style.display = isVisible ? 'none' : 'block';
        });

        // 点击其他地方关闭面板
        document.addEventListener('click', (e) => {
            if (!settingsContainer.contains(e.target as Node)) {
                settingsPanel.style.display = 'none';
            }
        });
    }

    // 创建滑块选项的辅助方法
    private createSliderOption(container: HTMLElement, label: string, defaultValue: number, min: number, max: number, step: number, onChange: (value: number) => void) {
        const settingItem = container.createDiv('setting-item');
        settingItem.createEl('label', { text: label });
        
        const controlGroup = settingItem.createDiv('setting-control-group');
        
        // 创建滑块
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.value = defaultValue.toString();
        slider.min = min.toString();
        slider.max = max.toString();
        slider.step = step.toString();
        controlGroup.appendChild(slider);
        
        // 创建数字输入框
        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.value = defaultValue.toString();
        numberInput.min = min.toString();
        numberInput.max = max.toString();
        numberInput.step = step.toString();
        controlGroup.appendChild(numberInput);

        // 同步滑块和输入框的值
        slider.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            numberInput.value = value.toString();
            onChange(value);
        });

        numberInput.addEventListener('change', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            slider.value = value.toString();
            onChange(value);
        });
    }

    // 创建复选框选项的辅助方法
    private createCheckboxOption(container: HTMLElement, label: string, defaultChecked: boolean): HTMLInputElement {
        const settingItem = container.createDiv('setting-item');
        
        // 创建复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = defaultChecked;
        settingItem.appendChild(checkbox);
        
        // 创建标签
        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        settingItem.appendChild(labelEl);
        
        return checkbox;
    }

    // 更新卡片布局的方法
    private updateCardLayout() {
        const container = this.container;
        if (!container) return;

        // 更新容器样式
        container.style.gap = `${this.cardSettings.cardGap}px`;

        // 计算每行卡片数量
        if (this.cardSettings.cardsPerRow > 0) {
            // 固定每行卡片数量
            const totalWidth = container.offsetWidth;
            const totalGap = this.cardSettings.cardGap * (this.cardSettings.cardsPerRow - 1);
            const cardWidth = (totalWidth - totalGap) / this.cardSettings.cardsPerRow;
            container.style.gridTemplateColumns = `repeat(${this.cardSettings.cardsPerRow}, ${cardWidth}px)`;
        } else {
            // 自动计算每行卡片数量
            container.style.gridTemplateColumns = `repeat(auto-fill, minmax(${this.cardSettings.cardWidth}px, 1fr))`;
        }

        // 更新所有卡片的尺寸
        container.querySelectorAll('.note-card').forEach((card: Element) => {
            if (card instanceof HTMLElement) {
                card.style.width = '100%';
                card.style.height = `${this.cardSettings.cardHeight}px`;
            }
        });
    }

    // 添加 setupIntersectionObserver 方法
    private setupIntersectionObserver(): void {
        this.intersectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(async (entry) => {
                    if (entry.isIntersecting) {
                        const noteContent = entry.target as HTMLElement;
                        const filePath = noteContent.getAttribute('data-path');
                        
                        if (filePath && !this.loadedNotes.has(filePath)) {
                            const file = this.app.vault.getAbstractFileByPath(filePath);
                            if (file instanceof TFile) {
                                await this.loadNoteContent(noteContent, file);
                            }
                        }
                    }
                });
            },
            {
                rootMargin: '100px',
                threshold: 0.1
            }
        );
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

    // 打开模态框
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

    // 关闭模态框
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

    // 打开模态框
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

        // 添加按钮
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

    // 获取文件夹层次结构
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

    // 创建文件夹树
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

    // 选择文件夹
    private selectFolder(element: HTMLElement, path: string) {
        // 除其他中状态
        this.contentEl.querySelectorAll('.folder-item').forEach(item => {
            item.removeClass('selected');
        });

        // 添加选中状态
        element.addClass('selected');
        this.selectedFolder = path;
    }

    // 移动文件
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