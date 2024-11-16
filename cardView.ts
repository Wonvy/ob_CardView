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

import { 
    openInAppropriateLeaf,
    getWeekDates,
    getEndOfWeek,
    getStartOfWeek,
    createFolderTree
 } from './ts/other'; 

 import { 
    renderStats,
 } from './ts/models';

export const VIEW_TYPE_CARD = 'card-view';
export const VIEW_TYPE_HOME = 'home-view';

// 添加模块类型定义
export interface HomeModule {
  id: string;
  name: string;
  type: 'heatmap' | 'recent' | 'weekly' | 'stats' | 'calendar' | 'graph' | 'quicknote' | 'todo'; // 添加 todo 类型
  visible: boolean;
  order: number;
  columns: number; // 添加列数属性
  settings?: any;
  position?: 'left' | 'center' | 'right'; // 添加位置属性
}

// 将 ConfirmModal 类移到 CardView 类外部
class ConfirmModal extends Modal {
    private result: boolean = false;
    private resolvePromise: (value: boolean) => void = () => {};
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

// 将 FolderItem 接口移到类外部
interface FolderItem {
    path: string;
    name: string;
    level: number;
}

// 将 EnhancedFileSelectionModal 类移到 CardView 类外部
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
            text: `动 ${this.files.length} 个文件` 
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
            text: '取'
        });
        cancelButton.addEventListener('click', () => this.close());
    }

    // 取文件夹层次结构
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

// 视图
export class CardView extends ItemView {
    private plugin: CardViewPlugin;
    private currentView: 'home' | 'card' | 'list' | 'timeline' | 'month' | 'week';
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
    private currentLoadingView: 'home' | 'card' | 'list' | 'timeline' | 'month' | 'week' | null;
    private cardSettings: {
        card: {
            showDate: boolean;
            showContent: boolean;
            cardGap: number;
            cardsPerRow: number;
            cardHeight: number;  // 新增
        };
        list: {
            showDate: boolean;
            showContent: boolean;
            cardGap: number;
            cardsPerRow: number;
            cardHeight: number;  // 新增
        };
        timeline: {
            showDate: boolean;
            showContent: boolean;
            cardGap: number;
            cardsPerRow: number;
            cardHeight: number;  // 新增
        };
        month: {
            showDate: boolean;
            showContent: boolean;
            cardGap: number;
            cardsPerRow: number;
            cardHeight: number;  // 新增
        };
    } = {
        card: {
            showDate: true,
            showContent: true,
            cardGap: 16,
            cardsPerRow: 4,
            cardHeight: 280  // 默认高度
        },
        list: {
            showDate: true,
            showContent: true,
            cardGap: 16,
            cardsPerRow: 1,
            cardHeight: 280
        },
        timeline: {
            showDate: true,
            showContent: true,
            cardGap: 16,
            cardsPerRow: 2,
            cardHeight: 280
        },
        month: {
            showDate: true,
            showContent: true,
            cardGap: 8,
            cardsPerRow: 1,
            cardHeight: 280
        }
    };
    private scrollTimeout: NodeJS.Timeout | null = null;
    private intersectionObserver!: IntersectionObserver;
    private weekViewContainer: HTMLElement;
    private currentWeek: number;
    private currentYear: number;
    private homeModules: HomeModule[] = [
        {
            id: 'heatmap',
            name: '活动热力图',
            type: 'heatmap',
            visible: true,
            order: 0,
            columns: 4
        },
        {
            id: 'weekly',
            name: '本周笔记',
            type: 'weekly',
            visible: true, 
            order: 1,
            columns: 4
        },
        {
            id: 'recent',
            name: '最近编辑',
            type: 'recent',
            visible: true,
            order: 2,
            columns: 4
        },
        {
            id: 'stats',
            name: '笔记统计',
            type: 'stats',
            visible: true,
            order: 3,
            columns: 4
        },
        {
            id: 'calendar',
            name: '日历',
            type: 'calendar',
            visible: true,
            order: 4,
            columns: 4
        }
    ];

    // 构造函数
    constructor(leaf: WorkspaceLeaf, plugin: CardViewPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentView = 'home';
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
        this.weekViewContainer = createDiv();
        this.currentWeek = this.getWeekNumber(new Date());
        this.currentYear = new Date().getFullYear();

        // 初始化 Intersection Observer
        this.setupIntersectionObserver();

        // 初始化周视图相关属性
        const today = new Date();
        this.currentYear = today.getFullYear();
        this.currentWeek = this.getWeekNumber(today);
        console.log('初始化周视图 - 年份:', this.currentYear, '周数:', this.currentWeek);

        // 使用插件保存的设初始化主页模块
        this.homeModules = plugin.settings.homeModules.length > 0 
            ? plugin.settings.homeModules 
            : DEFAULT_HOME_MODULES;
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
     * @returns 示在标签页上的文本
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
        
        // 左侧工具
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
        
        // 添加命令按钮
        this.createCommandButton(searchContainer);
        
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: '搜索记...',
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
                // 计算右下置
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
                placeholder: '输入笔内容，按 Enter 发送...'
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

        // 添代码按钮
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

        // 创建标签建容器
        const tagSuggestions = inputContainer.createDiv('tag-suggestions');

        // 添事件处理
        this.setupQuickNoteEvents(noteInput, quickNoteToolbar, tagSuggestions);

        // 初始搜索处理
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
        // this.container.style.gridTemplateColumns = `repeat(auto-fill, ${this.cardSize}px`;
        
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

        // 添加预制按钮
        const previewControls = previewWrapper.createDiv('preview-controls');
        const toggleButton = previewControls.createEl('button', {
            cls: 'preview-toggle',
            attr: { 'aria-label': '折叠预览' }
        });
        toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-right"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

        toggleButton.addEventListener('click', () => this.togglePreview());

        // 添加调整宽度的分隔线
        this.previewResizer = previewWrapper.createDiv('preview-resizer');

        // 创建预览器
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
                <span>准加载...</span>
            </div>
        `;
        this.statusLeft.appendChild(this.loadingStatus);
        
        // 添其他状态息
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

      

        // 在创建输入框后添加发送钮
        const sendButton = inputContainer.createEl('button', {
            cls: 'quick-note-send',
            attr: {
                'title': '发送笔记'
            }
        });
        sendButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        `;

        // 发送按钮事件
        sendButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const title = titleInput?.value?.trim();
            const content = noteInput.value.trim();
            
            if (!content) {
                new Notice('请输入笔记容');
                return;
            }

            try {
                // 获取所有已添加的标签
                const tagItems = tagsContainer?.querySelectorAll('.tag-item') ?? [];
                const tagTexts = Array.from(tagItems).map(item => item.textContent?.replace('×', '').trim() ?? '');
                
                // 构建笔记内容包含标签
                const tagsContent = tagTexts.map(tag => `#${tag}`).join(' ');
                const finalContent = tagsContent ? `${tagsContent}\n\n${content}` : content;
                
                // 使用标题作为文件如果没有使用日期
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
                    
                    // 刷新图
                    await this.refreshView();
                    
                    new Notice('创建成功');
                }
            } catch (error) {
                console.error('创建笔记失败:', error);
                new Notice('创建笔记失败');
            }
        });

        // 初始化完成后更新按钮状态
        this.updateToolbarButtons();

        // 初始化完成后，切换到主页视图
        this.switchView('home');
    }


    // 获取标签和数量
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


    // 加载标签
    private async loadTags() {
        const tagCounts = this.getTagsWithCount();
        this.tagContainer.empty();

        // 创建左侧区域
        const leftArea = this.tagContainer.createDiv('filter-toolbar-left');

        // 创建按钮组容器
        const buttonGroup = leftArea.createDiv('filter-toolbar-buttons');

        // 主页视图按钮组
        const homeButtons = buttonGroup.createDiv('home-view-buttons');
        homeButtons.setAttribute('data-views', 'home');  // 只在主页视图显示
        
        // 添加模块管理按钮
        const manageBtn = homeButtons.createEl('button',{
            cls: 'module-manage-btn',
            text: '管理布局'
        });
        
        manageBtn.addEventListener('click', () => {
            this.showModuleManager();
        });

        // 添加编辑布局按钮
        const editBtn = homeButtons.createEl('button', {
            cls: 'module-edit-btn',
            text: '编辑布局'
        });
        


        

        // 编辑布局按钮事件
        let isEditMode = false;
        editBtn.addEventListener('click', () => {
            isEditMode = !isEditMode;
            this.container.toggleClass('edit-mode', isEditMode);
            editBtn.setText(isEditMode ? '完成编辑' : '编辑布局');
            editBtn.toggleClass('active', isEditMode); // 添加这行，切换按钮的激活状态
            this.toggleModuleEditing(isEditMode);//切换模块辑
        });

        // 卡片视图按钮组
        const cardButtons = buttonGroup.createDiv('card-view-buttons');
        cardButtons.setAttribute('data-views', 'card,list,timeline,month,week');

        // 创建日历按钮
        const calendarBtn = cardButtons.createEl('button', {
            cls: 'calendar-toggle-button toolbar-button',
        });
        calendarBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>日历</span>
        `;

        // 创建卡片设置按
        const settingsBtn = cardButtons.createEl('button', {
            cls: 'card-settings-button toolbar-button',
        });
        settingsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <span>卡片设置</span>
        `;

        // 日历容器
        this.calendarContainer = calendarBtn.createDiv('calendar-container');
        this.calendarContainer.style.display = 'none';

        // 添加悬停事件
        let hoverTimeout: NodeJS.Timeout;
        calendarBtn.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimeout);
            this.showCalendar();
        });

        calendarBtn.addEventListener('mouseleave', () => {
            hoverTimeout = setTimeout(() => {
                this.hideCalendar();
            }, 200);
        });

        // 标签下拉列表容器
        const tagButtons = buttonGroup.createDiv('tag-view-buttons');        
        tagButtons.setAttribute('data-views', 'card,list,timeline,month,week'); 

        const dropdownContainer = tagButtons.createDiv('tag-dropdown-container');
        
        // 创建下拉列表
        const dropdown = dropdownContainer.createEl('select', {
            cls: 'tag-dropdown'
        });

        // 添加默认选项
        dropdown.createEl('option', {
            text: '标签',
            value: ''
        });

        // 创建自定义下拉面
        const dropdownPanel = dropdownContainer.createDiv('dropdown-panel');
        dropdownPanel.style.display = 'none';

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
                    dropdown.value = '';  // 重置下列表
                });
            });

        // 创建右侧已选标签容器
        const selectedTagsContainer = leftArea.createDiv('selected-tags-container');

        // 改拉列表示/隐藏逻
        let isMouseOverDropdown = false;
        let isMouseOverPanel = false;
        let hideTimeout: NodeJS.Timeout;

        // 鼠标进入下拉框时显面板
        dropdown.addEventListener('mouseenter', () => {
            isMouseOverDropdown = true;
            clearTimeout(hideTimeout);
            dropdownPanel.style.display = 'grid';
        });

        // 鼠标离开下拉框时
        dropdown.addEventListener('mouseleave', () => {
            isMouseOverDropdown = false;
            // 如果鼠标不在面板上，延迟隐
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
            // 如鼠标不在下拉框上，则延迟隐藏
            if (!isMouseOverDropdown) {
                hideTimeout = setTimeout(() => {
                    if (!isMouseOverDropdown && !isMouseOverPanel) {
                        dropdownPanel.style.display = 'none';
                    }
                }, 200);
            }
        });

        // 点击其他方时，检查鼠标是否在面板或下拉上
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
        
        // 创建卡片设置按钮
        const cardSettings = rightArea.createDiv('card-settings-container');
        cardSettings.setAttribute('data-views', 'card,list,timeline');

        this.createCardSettings(cardSettings);

        // 更新视图切事件
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                // 获取所有带有 data-views 属性的元素
                const elements = this.tagContainer.querySelectorAll('[data-views]');
                
                elements.forEach(el => {
                    if (el instanceof HTMLElement) {
                        const allowedViews = el.dataset.views?.split(',') || [];
                        el.style.display = allowedViews.includes(this.currentView) ? 'flex' : 'none';
                    }
                });
            })
        );
    }

    // 添加已选标签
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

    // 创建视图切换按钮
    private createViewSwitcher(container: HTMLElement) {
        const views = [
            { 
                id: 'home', 
                icon: 'home', 
                text: '主页视图',
                svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>'
            },
            { 
                id: 'card', 
                icon: 'grid', 
                text: '卡片视图',
                svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>'
            },
            { 
                id: 'list', 
                icon: 'list', 
                text: '列表视图',
                svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>'
            },
            { 
                id: 'timeline', 
                icon: 'clock', 
                text: '时间轴视图',
                svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
            },
            { 
                id: 'month', 
                icon: 'calendar', 
                text: '月历视图',
                svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
            },
            { 
                id: 'week', 
                icon: 'calendar', 
                text: '周视图',
                svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
            }
        ];
        
        views.forEach(view => {
            const btn = container.createEl('button', {
                cls: `view-switch-btn ${view.id === this.currentView ? 'active' : ''}`,
            });
            
            // 创建图标
            const iconSpan = btn.createSpan({ cls: 'view-switch-icon' });
            iconSpan.innerHTML = view.svg;
            
            // 添加文字
            btn.createSpan({ text: view.text, cls: 'view-switch-text' });
            
            btn.addEventListener('click', () => {
                container.querySelectorAll('.view-switch-btn').forEach(b => b.removeClass('active'));
                btn.addClass('active');
                this.switchView(view.id as 'home' | 'card' | 'list' | 'timeline' | 'month' | 'week');
            });
        });
    }

    // 切换视图
    public switchView(view: 'home' | 'card' | 'list' | 'timeline' | 'month' | 'week') {
        // 如果当前正在加载的视图与要切换的视图相同，直接返回
        if (this.currentLoadingView === view) {
            return;
        }

        // 如果有其他视图正在加载，中它
        if (this.currentLoadingView) {
            console.log(`中断 ${this.currentLoadingView} 视图的加载`);
            this.isLoading = false;
            this.timelineIsLoading = false;
            this.hasMoreNotes = false;
            this.timelineHasMore = false;
        }

        // 设置的当前视图和加载状态
        this.currentView = view;
        this.currentLoadingView = view;
        
        // 清空容器并设置新的视图属性
        this.container.empty();
        this.container.setAttribute('data-view', view);
        
        // 更新 content-section 的类名
        const contentSection = this.containerEl.querySelector('.content-section');
        if (contentSection) {
            contentSection.removeClass('view-home', 'view-card', 'view-list', 'view-timeline', 'view-month', 'view-week');
            contentSection.addClass(`view-${view}`);
        }

        // 根据视图类型加相内容
        let statusMessage = '';
        try {
            switch (view) {
                case 'home':
                    statusMessage = '切换到主页视图';
                    this.createHomeView();
                    break;
                case 'card':
                    statusMessage = '切换到卡片视图';
                    this.loadNotes();
                    break;
                case 'list':
                    statusMessage = '切换到列表视图 - 按文夹分组';
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
                case 'week':
                    statusMessage = '切换到周视图';
                    this.createWeekView();
                    break;
            }
            this.updateLoadingStatus(statusMessage);
        } catch (error) {
            console.error(`切换到${view}视图时出错:`, error);
            this.currentLoadingView = null;
        }

        // 更新按钮组显状态
        this.updateToolbarButtons();
    }

    // 添加新方法来更新按钮显示状态
    private updateToolbarButtons() {
        console.log('Current view:', this.currentView);
        
        const elements = this.tagContainer.querySelectorAll('[data-views]');
        elements.forEach(el => {
            if (el instanceof HTMLElement) {
                const allowedViews = el.dataset.views?.split(',') || [];
                const shouldShow = allowedViews.includes(this.currentView);
                console.log('Element:', el, 'Allowed views:', allowedViews, 'Should show:', shouldShow);
                el.style.display = shouldShow ? '' : 'none';
            }
        });
    }

    // 加载笔记
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
            
            console.log('笔记加完成');
        } catch (error) {
            console.error('loadNotes 错误:', error);
            new Notice('加载笔记失败，请检查控制台获取详细信息');
        } finally {
            if (this.currentLoadingView === 'card') {
                this.currentLoadingView = null;
            }
        }
    }

    // 加载下一页
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
            
            // 更新态栏信息
            this.updateLoadingStatus(`正在加载第 ${this.currentPage} 页 (${start + 1}-${end} / ${filteredFiles.length})`);

            // 创建卡片
            const cards = await Promise.all(
                pageFiles.map(async (file) => {
                    try {
                        return await this.createNoteCard(file);
                    } catch (error) {
                        console.error('创建卡片失:', file.path, error);
                        return null;
                    }
                })
            );
            
            // 添加卡片到容器
            cards.forEach(card => {
                if (card instanceof HTMLElement) {
                    // card.style.width = `${this.cardSize}px`;
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
                // 设置加载示器的最小高度，确保可以触发滚动
                this.loadingIndicator.style.minHeight = '100px';
            }
            
            this.currentPage++;
            
        } catch (error) {
            console.error('loadNextPage 错误:', error);
            this.updateLoadingStatus('加失败');
            new Notice('加载笔记失败');
        } finally {
            this.isLoading = false;
            if (!this.hasMoreNotes) {
                this.updateLoadingStatus('加载成');
                this.loadingIndicator.style.display = 'none';
            } else {
                this.loadingIndicator.style.display = 'flex';
            }
        }
    }

    // 过滤文件
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

            // 日期滤
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

    // 设置无限滚动
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

    // 创建笔记卡片
    private async createNoteCard(file: TFile): Promise<HTMLElement> {
        try {
            const card = document.createElement('div');
            card.addClass('note-card');
            card.setAttribute('data-path', file.path);
            
            // 设置卡片宽度和高度
            // card.style.width = `${this.cardSize}px`;
            // card.style.height = `${this.cardHeight}px`;
            
            // 创建卡片头部
            const header = card.createDiv('note-card-header');
            // 添加修改日期
            if (this.cardSettings[this.currentView as keyof typeof this.cardSettings].showDate) {
                const lastModified = header.createDiv('note-date show');
                lastModified.setText(new Date(file.stat.mtime).toLocaleDateString());
            }

            // 创建文件夹路径
            const folderPath = header.createDiv('note-folder');
            const folder = file.parent ? file.parent.path : '根目录';
            const pathParts = folder === '目' ? ['根目录'] : folder.split('/');

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
                
                // 获取到这层的完整路径（对根目录做特殊处理）
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

            // 创卡内容器
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
                // 创建笔内容容器
                const noteContent = cardContent.createDiv('note-content');
                if (this.cardSettings[this.currentView as keyof typeof this.cardSettings].showContent) {
                    noteContent.addClass('show');
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
                    if (!this.cardSettings.card.showContent) {
                        const noteContent = cardContent.querySelector('.note-content');
                        if (noteContent) {
                            noteContent.addClass('hover-show');
                            // 确保容已加载
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

                // 标离件
                card.addEventListener('mouseleave', () => {
                    openButton.style.opacity = '0';
                    // 根据设置决是否隐藏内容
                    if (!this.cardSettings.card.showContent) {
                        const noteContent = cardContent.querySelector('.note-content');
                        if (noteContent) {
                            noteContent.removeClass('hover-show');
                        }
                    }
                });

                // 改事件监听
                openButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await openInAppropriateLeaf(this.app,file);
                    card.addClass('selected'); // 给该卡片添加selected类
                    // 移除其余卡片的selected类
                    this.container.querySelectorAll('.note-card').forEach(cardElement => {
                        if (cardElement !== card) {
                            cardElement.removeClass('selected');
                        }
                    });
                });
            } catch (error) {
                console.error('笔记加载失败:', error);
                throw error; // 重新抛出错误以便上层处理
            }

            // 加卡片悬停件
            card.addEventListener('mouseenter', async () => {
                openButton.style.opacity = '1';  // 示打开按钮
                // ... 其他悬停事 ...
            });

            card.addEventListener('mouseleave', () => {
                openButton.style.opacity = '0';  // 隐藏打开按钮
                // ... 其他离事件代 ...
            });
            // 修改内容显示逻辑
            if (this.cardSettings.card.showContent) {
                // 创建笔记内容
                const noteContent = cardContent.createDiv('note-content');
                // ... 内容加载逻辑 ...
            }

            // 添加键菜单事件听
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e, [file]); // 传入当前文件
            });

            // 添加点击事件于多选
            card.addEventListener('click', (e) => {
                this.handleCardSelection(file.path, e);
            });

            return card;

        } catch (error) {
            console.error('笔记加载失败:', error);
            throw error; // 重新抛出错误以便上层处理
        }
    }

    // 预览栏-切换
    private togglePreview() {
        this.isPreviewCollapsed = !this.isPreviewCollapsed;
        const previewWrapper = this.containerEl.querySelector('.preview-wrapper');
        
        if (this.isPreviewCollapsed) {
            this.previewContainer.addClass('collapsed');
            previewWrapper?.addClass('collapsed');
            if (previewWrapper instanceof HTMLElement) {
                previewWrapper.style.width = '0px';  // 直接设宽度为0
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
            const width = '300px';  // 默认度
            if (previewWrapper instanceof HTMLElement) {
                previewWrapper.style.width = width;
            }
            this.previewContainer.style.width = width;
            // 调整内区域
            // this.adjustContentWidth();
        }

        // 更新折叠按图标方向
        const toggleButton = this.containerEl.querySelector('.preview-toggle svg');
        if (toggleButton instanceof SVGElement) {  // 修改型检
            toggleButton.style.transform = this.isPreviewCollapsed ? '' : 'rotate(180deg)';
        }
    }

    // 预览栏-调整大小
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
                
                // 如果正在调整大小，确保预栏是展开的
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
            const gap = 16; // 片间距
            const actualCardWidth = (availableWidth - (columns - 1) * gap) / columns;
            
            this.container.style.gridTemplateColumns = `repeat(${columns}, ${actualCardWidth}px)`;
        }
    }

    // 笔记-创建
    private async createNewNote(date?: Date) {
            // 获取当前日期作为默认文件名
        const baseFileName = date ? date.toLocaleDateString() : '未命';
            let fileName = baseFileName;
            let counter = 1;

            // 检查文件名是否已存在
            while (this.app.vault.getAbstractFileByPath(`${fileName}.md`)) {
            const file = this.app.vault.getAbstractFileByPath(`${fileName}.md`);
            if (file instanceof TFile && file.stat.size === 0) {
                // 如果记内容为空，则打开这个笔
                await openInAppropriateLeaf(this.app,file,false);
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

            // 在新签中打开笔
            // const leaf = this.app.workspace.getLeaf('tab');
            await openInAppropriateLeaf(this.app,file,false);

            // 刷新片视图
            this.loadNotes();
        } catch (error) {
            console.error('创建笔记失败:', error);
        }
    }

    // 速笔记-创建
    private async createQuickNote(content: string, types: string[], fileName: string): Promise<TFile | null> {
        try {
            // 生成唯一的件
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

    // 时间轴-加载
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
            
            // 检查是否还更多
            this.timelineHasMore = end < sortedDates.length;
            
            // 更新状态信息
            this.updateLoadingStatus(`时间轴视图 - 加载第 ${this.timelineCurrentPage} 页 (${start + 1}-${end} / ${sortedDates.length} 天)`);

            // 使用虚拟滚动技术
            const fragment = document.createDocumentFragment();
            const batchSize = 3; // 每批处理的日组数
            const batches = Math.ceil(pageDates.length / batchSize);

            for (let i = 0; i < batches; i++) {
                await new Promise<void>(resolve => {
                    window.requestAnimationFrame(async () => {
                        const batchDates = pageDates.slice(i * batchSize, (i + 1) * batchSize);
                        
                        for (const date of batchDates) {
                            const dateGroup = document.createElement('div');
                            dateGroup.className = 'timeline-date-group';
                            
                            // 只有在 showDate 为 true 时才添加日期节点
                            if (this.cardSettings.timeline.showDate) {
                                dateGroup.innerHTML = `
                                    <div class="timeline-date-node">
                                        <div class="timeline-node-circle"></div>
                                        <div class="timeline-date-label">${date}</div>
                                    </div>
                                `;
                            }

                            const notesList = dateGroup.createDiv('timeline-notes-list');
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
                                    // 只有在当前视图然是时间轴时才替换占符
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

            // 一次加所有内到容器
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

    // 时间轴-滚动听
    private setupTimelineScroll(container: HTMLElement) {
        try {
            console.log('设置时间轴滚监听...');
            
            // 使用 Intersection Observer 听加载指示器
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
                    console.log('滚动触发时轴加载更多');
                    this.loadTimelinePage(container);
                }
            });
            
            console.log('已添加时轴滚动事件监听');
            
        } catch (error) {
            console.error('设置时间轴滚动监听失败:', error);
        }
    }

    // 刷新视图
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
        
        this.updateLoadingStatus('刷视图...');
    }

    // 卡片-选择
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

    // 清除择
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

    // 右键菜单
    private showContextMenu(event: MouseEvent, files: TFile[]) {
        console.log('显示右键菜单:', event, files); // 添加调试日志
        
        const menu = new Menu();

        if (files.length > 0) {
            menu.addItem((item) => {
                item
                    .setTitle(`在新标签页打开`)
                    .setIcon("link")
                    .onClick(async () => {
                        for (const file of files) {
                            await openInAppropriateLeaf(this.app,file);
                        }
                    });
            });

            // 文件列表中显示
            menu.addItem((item) => {
                item
                    .setTitle(`文件列表中显示`)
                    .setIcon("folder")
                    .onClick(async () => {
                        const file = files[0];  //示第一个选中文件的位置
                        await openInAppropriateLeaf(this.app,file,false);
                    });
            });

            // 移动文件
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

            // 删除文件
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
                                        // 动画完成后除DOM元素
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
        menu.showAtMouseEvent(event); //显示右键菜单
    }
    
    // 卡片-调整大
    public adjustCardSize(delta: number): void {
        const adjustment = delta > 0 ? -10 : 10;
        const newSize = Math.max(
            this.plugin.settings.minCardWidth,
            this.cardSize + adjustment
        );

        if (newSize !== this.cardSize) {
            this.cardSize = newSize;
            this.updateCardSize(newSize);
            // 保存新的宽度
            this.plugin.saveCardWidth(newSize);
        }
    }

    // 卡-调整高度
    public adjustCardHeight(delta: number): void {
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

    // 卡片-更新大小
    public updateCardSize(width: number) {
        this.cardSize = width;
        // 更新所有卡片的宽度
        this.container.querySelectorAll('.note-card').forEach((card: Element) => {
            if (card instanceof HTMLElement) {
                card.style.width = `${width}px`;
            }
        });
        // 更新容器的网格列宽度
        // this.container.style.gridTemplateColumns = `repeat(auto-fill, ${width}px)`;
    }

    // 卡片-更新高度
    private updateCardHeight(height: number) {
        this.cardHeight = height;
        // 更新所有卡片的高度
        this.container.querySelectorAll('.note-card').forEach((card: Element) => {
            if (card instanceof HTMLElement) {
                card.style.height = `${height}px`;
            }
        });
    }

    // 日历-显示
    private showCalendar() {
        if (!this.calendarContainer) return;
        
        this.calendarContainer.empty();
        this.calendarContainer.style.display = 'block';
        
        // 创建日头部
        const header = this.calendarContainer.createDiv('calendar-header');
        
        // 上个月钮
        const prevBtn = header.createEl('button', { cls: 'calendar-nav-btn' });
        prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        
        // 显示年月
        const titleEl = header.createDiv('calendar-title scrollable');
        titleEl.setText(`${this.currentDate.getFullYear()}年${this.currentDate.getMonth() + 1}月`);
        
        // 下个月按钮
        const nextBtn = header.createEl('button', { cls: 'calendar-nav-btn' });
        nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

        // 添加滚轮事件到标题元素
        titleEl.addEventListener('wheel', (e) => {
            e.preventDefault(); // 防止页面滚动
            
            // 向上滚动切换到下个月，向下滚动切换到上个月
            if (e.deltaY < 0) {
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            } else {
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            }
            
            // 更新标题
            titleEl.setText(`${this.currentDate.getFullYear()}年${this.currentDate.getMonth() + 1}`);
            
            // 清空并重新渲染日历内容区域
            const existingContent = this.calendarContainer.querySelector('.calendar-weekdays, .calendar-grid');
            if (existingContent) {
                existingContent.remove();
            }
            
            // 创建星期头部
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekHeader = this.calendarContainer.createDiv('calendar-weekdays');
            weekdays.forEach(day => {
                weekHeader.createDiv('weekday').setText(day);
            });

            // 创建日历网格
            const grid = this.calendarContainer.createDiv('calendar-grid');
            
            // 获取当月的笔记
            const notesByDate = this.getNotesByDate(
                this.currentDate.getFullYear(),
                this.currentDate.getMonth()
            );
            
            // 创建笔记列表容
            const notesSection = this.calendarContainer.createDiv('notes-section');
            
            // 填充日期格子
            this.renderCalendarDays(grid, notesByDate, notesSection);
        });

        // 添加鼠标提示
        titleEl.setAttribute('title', '滚动鼠标滚轮切换月份');

        // 添加导航事件
        prevBtn.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            titleEl.setText(`${this.currentDate.getFullYear()}年${this.currentDate.getMonth() + 1}月`);
            this.renderCalendarContent(this.calendarContainer);
        });
        
        nextBtn.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            titleEl.setText(`${this.currentDate.getFullYear()}年${this.currentDate.getMonth() + 1}月`);
            this.renderCalendarContent(this.calendarContainer);
        });

        // 渲染初始日历内容
        this.renderCalendarContent(this.calendarContainer);
    }

    // 日历-隐藏
    private hideCalendar() {
        if (!this.calendarContainer) return;
        this.calendarContainer.style.display = 'none';
    }

    // 添加渲染日历内容的方法
    private renderCalendarContent(container: HTMLElement) {
        // 创建星期头部
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekHeader = container.createDiv('calendar-weekdays');
        weekdays.forEach(day => {
            weekHeader.createDiv('weekday').setText(day);
        });

        // 创建日历网格
        const grid = container.createDiv('calendar-grid');
        
        // 获取当月的笔记
        const notesByDate = this.getNotesByDate(
            this.currentDate.getFullYear(),
            this.currentDate.getMonth()
        );

        // 创建笔记列表容器
        const notesSection = container.createDiv('notes-section');
        
        // 填充日期格，传入 notesSection 参数
        this.renderCalendarDays(grid, notesByDate, notesSection);
    }


    // 高亮文本
    private highlightText(text: string, searchTerm: string): string {
        if (!searchTerm || searchTerm.trim() === '') {
            return text; // 如果搜索词为空，直接返回原文本
        }
        
        const escapedSearchTerm = searchTerm
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 特殊字符
            .trim(); // 确保去除空格
        
        const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    }

    // 搜索=文件内
    private async fileContentContainsSearch(file: TFile): Promise<boolean> {
        if (!this.currentSearchTerm || this.currentSearchTerm.trim() === '') {
            return true;
        }

        try {
            const content = await this.app.vault.cachedRead(file);
            const searchTerm = this.currentSearchTerm.trim().toLowerCase();
            const fileContent = content.toLowerCase();
            
            // 检查文件容是否包含搜索词
            return fileContent.includes(searchTerm);
        } catch (error) {
            console.error('读取文件内容失败:', error);
            return false;
        }
    }

    // 搜索-设置
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

    // 令-创建按钮
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
        batchRenameItem.setText('批量重名');
        batchRenameItem.addEventListener('click', () => {
            menu.style.display = 'none';  // 点击隐藏菜单
            console.log('批量重命名功能实现');
        });

        // 使用击事替代鼠标悬停事件
        let isMenuVisible = false;
        
        // 点击按钮时菜单显状态
        commandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isMenuVisible = !isMenuVisible;
            menu.style.display = isMenuVisible ? 'block' : 'none';
        });

        // 点击其他地方时藏菜单
        document.addEventListener('click', (e) => {
            if (!commandContainer.contains(e.target as Node)) {
                isMenuVisible = false;
                menu.style.display = 'none';
            }
        });
    }

    // 命令-删除空白笔记
    private async deleteEmptyNotes() {
        const selectedFiles = this.getSelectedFiles();
        if (selectedFiles.length === 0) {
            // 如果没有中的笔，提用户
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

    // 月历-创建月视图
    private async createMonthView() {
        if (this.currentLoadingView !== 'month') {
            console.log('中断月历视图��载：视图已切换');
            return;
        }

        try {
            if (!this.container.querySelector('.month-view')) {
                const monthContainer = this.container.createDiv('month-view');
                
                // 创建月视图头部
                const header = monthContainer.createDiv('month-header');
                
                // 年份显示区域
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
                
                // 添加份切换事件
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
                    
                    // 添加点事
                    monthBtn.addEventListener('click', () => {
                        this.selectMonth(i - 1);
                    });
                }
                
                // 添今天按钮
                const todayBtn = header.createEl('button', { 
                    cls: 'today-btn',
                    text: '今天'
                });
                todayBtn.addEventListener('click', () => this.goToToday());
                
                // 添滚轮事件
                monthSelector.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    this.navigateMonth(e.deltaY > 0 ? 1 : -1);
                });
                
                // 创建星期头部
                const weekdays = ['', '一', '二', '三', '四', '五', '六'];
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

    // 月历-选择月份
    private selectMonth(month: number) {
        this.currentDate = new Date(this.currentDate.getFullYear(), month);
        this.updateMonthView();
    }

    // 月历-更新月视图
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

    // 月历-月份导航
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

    // 月历-跳转到今天
    private goToToday() {
        this.currentDate = new Date();
        this.updateMonthView();
    }

    // 月历-渲染视图格
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
                        await openInAppropriateLeaf(this.app,note);
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

    // 月历-获取每日笔记数量
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

    // 年份导航
    private navigateYear(delta: number) {
        this.currentDate = new Date(this.currentDate.getFullYear() + delta, this.currentDate.getMonth());
        this.updateMonthView();
    }

    // 列表-创建视图
    private async createListView() {
        if (this.currentLoadingView !== 'list') {
            console.log('中列表视图加载：视图已换');
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
                
                // 创建文件组题
                const folderHeader = folderGroup.createDiv('folder-header');
                
                // 添加文件夹图标
                const folderIcon = folderHeader.createDiv('folder-icon');
                folderIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
                
                // 添加件夹名称
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

            // 应用视图设置
            this.updateCardLayout();

        } finally {
            if (this.currentLoadingView === 'list') {
                this.currentLoadingView = null;
            }
        }
    }

    // 列表-显文件夹内容
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
            
            // 添加笔标题
            const noteTitle = noteItem.createDiv('note-title');
            noteTitle.setText(note.basename);
            
            // 添加修日期
            const noteDate = noteItem.createDiv('note-date');
            noteDate.setText(new Date(note.stat.mtime).toLocaleString());
            
            // 添加事件监听
            this.addNoteItemEvents(noteItem, note);
        });
    }

    // 列表-添加笔记项事件
    private addNoteItemEvents(noteItem: HTMLElement, note: TFile) {
        // 单击选择
        noteItem.addEventListener('click', (e) => {
            this.handleCardSelection(note.path, e);
        });

        // 双击打开
        noteItem.addEventListener('dblclick', async () => {
            await openInAppropriateLeaf(this.app,note);
        });

        // 右菜单
        noteItem.addEventListener('contextmenu', (e) => {
            console.log('菜单');
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

    // 标签-刷新
    public refreshTags() {
        this.loadTags();
    }

    // 滚动同步
    private setupScrollSync() {
        // 获取卡片容器和预览器
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

            // 设置时器来恢复鼠标样式
            setTimeout(() => {
                cardContainer.style.cursor = 'default';
            }, 150);

            // 同步览容器的滚动位置
            previewContainer.scrollTop += e.deltaY;
        });

        // 预览容添加滚动事件监听
        previewContainer.addEventListener('wheel', (e: WheelEvent) => {
            // 添加滚动时的鼠标样式
            previewContainer.style.cursor = 'ns-resize';

            // 设置定时器来恢复鼠标样式
            setTimeout(() => {
                previewContainer.style.cursor = 'default';
            }, 150);
        });
    }

    // 快速记-设置事件
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

        // 存储最使用的标签并初始化显示
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

        // 修改添加标的方法
        const addTag = (tagText: string) => {
            if (!tagText || tags.has(tagText)) return;
            
            const tagItem = tagsContainer?.createDiv('tag-item');
            tagItem?.setText(tagText);
            
            // 所有标签添加删除按钮，包括最近使用的标签
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

        // 修改 handleSendNote 函数的实
        const handleSendNote = async () => {
            const title = titleInput?.value?.trim();
            const content = input.value.trim();
            
            if (!content) {
                new Notice('请输入笔记内容');
                return;
            }

            try {
                // 获取所有添加的标签
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

                // 创建记
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
                    
                    new Notice('笔创建成功');
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

        // 修改 Enter 键处
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
                        
                        // 添加点击切换态事件
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

    // 速笔记-清理入
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

        // 重工具栏按钮状态
        const toolbar = contentInput.closest('.quick-note-bar')?.querySelector('.quick-note-toolbar');
        if (toolbar) {
            toolbar.querySelectorAll('.quick-note-btn').forEach(btn => {
                btn.removeClass('active');
            });
        }
    }

    // 拖拽
    private setupDraggable(element: HTMLElement) {
        let isDragging = false;
        let offsetX: number;
        let offsetY: number;
        let startX: number;
        let startY: number;
        let isClick = true; // 新增变量，用于判断是否为点击事件

        const dragStart = (e: MouseEvent) => {
            // 检查是否应该允许拖
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

            // 获各种位置信息
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
            
            // 如果移动超过阈值则不是点击
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

    // 保存最近标签
    private saveRecentTags(tags: string[]) {
        localStorage.setItem('recent-tags', JSON.stringify(tags));
    }

    // 加载最近标签
    private loadRecentTags(): string[] {
        const saved = localStorage.getItem('recent-tags');
        return saved ? JSON.parse(saved) : [];
    }

    // 快速笔-最小化
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
        
        // 根据位置计算最化后的位置
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

    // 快速笔记-恢复
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
        
        // 计算对于 workspace-leaf-content 的置
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

    // 获取快速笔记位置
    private getQuickNotePosition(element: HTMLElement) {
        const workspaceLeafContent = this.containerEl.closest('.workspace-leaf-content');
        if (!workspaceLeafContent) return 'center';

        const leafRect = workspaceLeafContent.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        // 计元素中点
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

    // 笔记内容-观察
    private observeNoteContent(element: HTMLElement, file: TFile) {
        if (this.intersectionObserver) {
            this.intersectionObserver.observe(element);
        }
    }

    // 笔记内容-载
    private async loadNoteContent(container: HTMLElement, file: TFile) {
        if (this.loadedNotes.has(file.path)) return;
        
        try {
            container.empty(); // 清除载位符
            
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

    // 关闭
    async onClose() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        this.loadedNotes.clear();
        // ... 其他清理代码 ...
    }

    // 状态栏-更新加载状态
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

    // 创建时间轴视图
    private async createTimelineView() {
        try {
            // 清容器内容
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

            // 应用视图设置
            this.updateCardLayout();
            
        } catch (error) {
            console.error('创建时轴视图失败:', error);
            new Notice('创建时间轴视图失败');
            this.updateLoadingStatus('创建时间视图失败');
        }
    }

    // 创建卡片设置面板
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

        // 切换面板显示时更新设置状态
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = settingsPanel.style.display === 'block';
            
            if (!isVisible) {
                // 打开面板时，更新设置状态以反映当前视图的设
                this.updateSettingsPanel(settingsPanel);
            }
            
            settingsPanel.style.display = isVisible ? 'none' : 'block';
        });

        // 点击其他地方关闭面板
        document.addEventListener('click', (e) => {
            if (!settingsContainer.contains(e.target as Node)) {
                settingsPanel.style.display = 'none';
            }
        });
    }

    // 更新设置面板状态
    private updateSettingsPanel(settingsPanel: HTMLElement) {
        // 空现有设置
        settingsPanel.empty();
        // 获取当前视图的设置
        const currentSettings = this.cardSettings[this.currentView as keyof typeof this.cardSettings];

        // 添加基本设置选项
        const basicSettings = settingsPanel.createDiv('settings-section');
        basicSettings.createEl('h3', { text: '基本设置' });

        // 显示日期选
        const showDateOption = this.createCheckboxOption(basicSettings, '显示日期', currentSettings.showDate);
       
        showDateOption.addEventListener('change', (e) => {
            currentSettings.showDate = (e.target as HTMLInputElement).checked;
            const dateElements = this.container.querySelectorAll('.note-date');
            dateElements.forEach(element => {
                // 如果显示日期，则显，否则隐藏
                if (currentSettings.showDate) {
                    element.removeClass('hide');
                    element.addClass('show');
                } else {
                    element.removeClass('show');
                    element.addClass('hide');
                }
            });
 
        });

        // 显示内容选项
        const showContentOption = this.createCheckboxOption(basicSettings, '显示笔记内容', currentSettings.showContent);
        showContentOption.addEventListener('change', (e) => {
            currentSettings.showContent = (e.target as HTMLInputElement).checked;
            // 所有视图统一处理笔内容显示/隐藏
            const contentElements = this.container.querySelectorAll('.note-content');
            contentElements.forEach(element => {
                if (currentSettings.showContent) {
                    element.addClass('show');
                } else {
                    element.removeClass('show');
                }
            });
        });

        // 添加布置
        const layoutSettings = settingsPanel.createDiv('settings-section');
        layoutSettings.createEl('h3', { text: '布局设置' });

        // 卡片高度设置
        this.createSliderOption(layoutSettings, '卡片高', currentSettings.cardHeight, 200, 500, 10, (value) => {
            currentSettings.cardHeight = value;
            // 统一处理所有卡片高度调整
            this.container.querySelectorAll('.note-card').forEach((card: Element) => {
                if (card instanceof HTMLElement) {
                    card.style.height = `${value}px`;
                }
            });
        });

        // 卡片间距设置
        this.createSliderOption(layoutSettings, '卡片间距', currentSettings.cardGap, 0, 40, 4, (value) => {
            currentSettings.cardGap = value;
            if (this.currentView === 'card') {
                // 卡片视图新间距
                this.container.style.gap = `${value}px`;
            } else if (this.currentView === 'timeline') {
                // 时间轴视图更新笔记列表的间距
                const notesLists = this.container.querySelectorAll('.timeline-notes-list');
                notesLists.forEach(list => {
                    if (list instanceof HTMLElement) {
                        list.style.gap = `${value}px`;
                    }
                });
            }
        });

        // 每行卡片数量设置1
        const updateCardsPerRow = (value: number) => {

            cardsPerRowInput.value = value.toString();// 更新输入框的值
            currentSettings.cardsPerRow = value; // 更新设置
            
            if (this.currentView === 'card') {
                // 只更新网布局
                const containerWidth = this.container.offsetWidth;
                const totalGap = value >= 0 ? currentSettings.cardGap : 0; // 确保不小于0
                // 大列数
                const maxColumns = Math.floor(containerWidth / (180 + totalGap));
                console.log('containerWidth', containerWidth);
                console.log('totalGap', totalGap);
                console.log('maxColumns', maxColumns);
                // 如果宽度小于150px，则repeat取最大的数
                const repeatValue = value > maxColumns ? maxColumns : value;
                this.container.style.gridTemplateColumns = `repeat(${repeatValue}, minmax(150px, 1fr))`;
            } else if (this.currentView === 'timeline') {
                // 更新间轴视图的片布局
                const notesLists = this.container.querySelectorAll('.timeline-notes-list');
                notesLists.forEach(list => {
                    if (list instanceof HTMLElement) {
                        list.style.gridTemplateColumns = `repeat(${value}, 1fr)`;
                    }
                });
            }
        };

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
            value: currentSettings.cardsPerRow.toString(),
            placeholder: '自动'
        });
        
        // 加按
        const increaseBtn = controlGroup.createEl('button', {
            cls: 'cards-per-row-btn increase',
            text: '+'
        });

        // 少按钮事件
        decreaseBtn.addEventListener('click', () => {
            const currentValue = parseInt(cardsPerRowInput.value) || 4; // 默认值为4
            if (currentValue > 0) { // 只有当值大于0才减少
                updateCardsPerRow(Math.max(1, currentValue - 1)); // 确保不小于0
            }
        });

        increaseBtn.addEventListener('click', () => {
            const currentValue = parseInt(cardsPerRowInput.value) || 4;
            updateCardsPerRow(currentValue + 1);
        });

        // 输入框事
        cardsPerRowInput.addEventListener('change', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            updateCardsPerRow(isNaN(value) ? 4 : value);
        });

        // 添加滚轮支持
        cardsPerRowInput.addEventListener('wheel', (e) => {
            e.preventDefault(); // 防止页面滚动
            if (document.activeElement === cardsPerRowInput) { // 只在输入框获得焦点时响应
                const delta = e.deltaY > 0 ? -1 : 1; // 向上滚动增加，向下滚动减少
                const currentValue = parseInt(cardsPerRowInput.value) || 4;
                updateCardsPerRow(currentValue + delta);
            }
        });
    }

    // 创建选框选项
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

    // 新卡片布局
    private updateCardLayout() {
        const container = this.container;
        if (!container) return;

        const currentSettings = this.cardSettings[this.currentView as keyof typeof this.cardSettings];

        // 更新容器样式
        container.style.gap = `${currentSettings.cardGap}px`;

        // 更新所有卡片的高度
        container.querySelectorAll('.note-card').forEach((card: Element) => {
            if (card instanceof HTMLElement) {
                card.style.height = `${currentSettings.cardHeight}px`;
            }
        });

        // 计算每行最大可的卡片数量
        const minCardWidth = 150;
        const containerWidth = container.offsetWidth;
        const maxPossibleCards = Math.floor((containerWidth + currentSettings.cardGap) / (minCardWidth + currentSettings.cardGap));

        // 计算每行卡片数量
        if (currentSettings.cardsPerRow > 0) {
            // 固定每行卡片数量，但不超过最大可能数量
            const columns = Math.min(currentSettings.cardsPerRow, maxPossibleCards);
            const totalGap = currentSettings.cardGap * (columns - 1);
            const cardWidth = (containerWidth - totalGap) / columns;
            container.style.gridTemplateColumns = `repeat(${columns}, ${cardWidth}px)`;
        } else {
            // 自动计算每行卡片数量（使用视图认值）
            const defaultColumns = this.cardSettings[this.currentView as keyof typeof this.cardSettings].cardsPerRow;
            const columns = Math.min(defaultColumns, maxPossibleCards);
            const totalGap = currentSettings.cardGap * (columns - 1);
            const cardWidth = (containerWidth - totalGap) / columns;
            container.style.gridTemplateColumns = `repeat(${columns}, ${cardWidth}px)`;
        }
    }

    // 设置观察器
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

    // 创建滑块选项
    private createSliderOption(
        container: HTMLElement, 
        label: string, 
        defaultValue: number, 
        min: number, 
        max: number, 
        step: number, 
        onChange: (value: number) => void
    ): void {
        const settingItem = container.createDiv('setting-item');
        settingItem.createEl('label', { text: label });
        
        const controlGroup = settingItem.createDiv('setting-control-group');
        
        // 减少按钮
        const decreaseBtn = controlGroup.createEl('button', {
            cls: 'setting-control-btn decrease',
            text: '-'
        });
        
        // 创建数字输入框
        const numberInput = controlGroup.createEl('input', {
            type: 'number',
            value: defaultValue.toString(),
            attr: {
                min: min.toString(),
                max: max.toString(),
                step: step.toString()
            }
        });
        
        // 增加按钮
        const increaseBtn = controlGroup.createEl('button', {
            cls: 'setting-control-btn increase',
            text: '+'
        });

        // 更新值的函数
        const updateValue = (value: number) => {
            // 确保值在范围内
            value = Math.max(min, Math.min(max, value));
            numberInput.value = value.toString();
            onChange(value);
        };

        // 添按钮事件
        decreaseBtn.addEventListener('click', () => {
            const currentValue = parseInt(numberInput.value) || defaultValue;
            updateValue(currentValue - step);
        });

        increaseBtn.addEventListener('click', () => {
            const currentValue = parseInt(numberInput.value) || defaultValue;
            updateValue(currentValue + step);
        });

        // 入框事件
        numberInput.addEventListener('change', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            updateValue(isNaN(value) ? defaultValue : value);
        });

        // 添加滚轮支持
        numberInput.addEventListener('wheel', (e) => {
            e.preventDefault(); // 防止页面滚动
            if (document.activeElement === numberInput) { // 只在输入框获得焦点时响应
                const delta = e.deltaY > 0 ? -step : step;
                const currentValue = parseInt(numberInput.value) || defaultValue;
                updateValue(currentValue + delta);
            }
        });
    }

    // 添加获取周数的方法
    private getWeekNumber(date: Date): number {
        const target = new Date(date.valueOf());
        const dayNr = (date.getDay() + 6) % 7; // 调整为周一为一周的开始
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = target.valueOf();
        target.setMonth(0, 1);
        if (target.getDay() !== 4) {
            target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
        }
        const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
        console.log(`计算周数 - 期:${date.toISOString()}, 周数:${weekNum}`);
        return weekNum;
    }

    // 创建周视图
    private async createWeekView() {
        // 确当前正在加载的周视图
        if (this.currentLoadingView !== 'week') {
            return;
        }

        try {
            console.log('开始创建周图');
            this.container.empty();
            const weekContainer = this.container.createDiv('week-view');
            
            // 创建周视图头部
            const header = weekContainer.createDiv('week-header');
            const navGroup = header.createDiv('week-nav-group');
            
            // 上一周按钮
            const prevWeekBtn = navGroup.createEl('button', { 
                cls: 'week-nav-btn',
                attr: { title: '上一周' }
            });
            prevWeekBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
            
            // 显示当前周信息
            const weekInfo = navGroup.createDiv('week-info');
            const currentMonth = this.getMonthForWeek(this.currentYear, this.currentWeek);
            weekInfo.setText(`${this.currentYear}年${currentMonth}月 第${this.currentWeek}周`);
            
            // 添加本周按钮
            const currentWeekBtn = navGroup.createEl('button', {
                cls: 'week-nav-btn current-week',
                attr: { title: '返回本周' }
            });
            currentWeekBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
            `;
            
            // 下一周按钮
            const nextWeekBtn = navGroup.createEl('button', { 
                cls: 'week-nav-btn',
                attr: { title: '下一周' }
            });
            nextWeekBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

            // 添加导航事件
            prevWeekBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.navigateWeek(-1);
            });
            
            currentWeekBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.goToCurrentWeek();
            });
            
            nextWeekBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.navigateWeek(1);
            });

            // 创建周视图内容区域
            const weekContent = weekContainer.createDiv('week-content');
            
            // 获取本周的日期范围
            const weekDates = getWeekDates(this.currentYear, this.currentWeek);
            
            // 创建日期头部
            const daysHeader = weekContent.createDiv('week-days-header');
            // 修改顺序，将周日放到最后
            const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
            weekdays.forEach((day, index) => {
                const dayHeader = daysHeader.createDiv('week-day-header');
                // 调整日期索引，将周日对应的日期放到最后
                const dateIndex = index === 6 ? 0 : index + 1;
                const date = weekDates[dateIndex];
                dayHeader.innerHTML = `
                    <div class="weekday-name">${day}</div>
                    <div class="date-number">${date.getDate()}</div>
                `;
            });

            // 创建笔记容器
            const notesContainer = weekContent.createDiv('week-notes-container');
            
            // 调整日期顺序，将周日的笔记放到最后
            const reorderedDates = [
                ...weekDates.slice(1), // 周一到周六
                weekDates[0]           // 周
            ];
            
            // 为每一天创建笔记列表
            reorderedDates.forEach(async date => {
                const dayNotes = notesContainer.createDiv('day-notes-column');
                const notes = await this.getNotesForDate(date);
                
                notes.forEach(note => {
                    const noteCard = this.createWeekNoteCard(note);
                    dayNotes.appendChild(noteCard);
                });
            });

        } catch (error) {
            console.error('创建周视图失败:', error);
            new Notice('创建周视图失败');
        } finally {
            // 只有当前仍在加载周视图时才清除加载状态
            if (this.currentLoadingView === 'week') {
                this.currentLoadingView = null;
            }
        }
    }

    // 添加返回本周的方法
    private goToCurrentWeek() {
        const today = new Date();
        this.currentYear = today.getFullYear();
        this.currentWeek = this.getWeekNumber(today);
        this.createWeekView();
    }

    // 修改获取指定日期的笔记方法加日期范围查
    private async getNotesForDate(date: Date): Promise<TFile[]> {
        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => {
            const fileDate = new Date(file.stat.ctime);
            return this.isSameDay(fileDate, date);
        }).sort((a, b) => b.stat.mtime - a.stat.mtime); // 按修改时间降序排序
    }

    // 添加日期比较方法
    private isSameDay(date1: Date, date2: Date): boolean {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }



    // 创建周视图的笔记卡片
    private createWeekNoteCard(file: TFile): HTMLElement {
        const card = createDiv('week-note-card');
        
        // 添加标题
        const title = card.createDiv('week-note-title');
        title.setText(file.basename);
        
        // 添加修改时间
        const time = card.createDiv('week-note-time');
        time.setText(new Date(file.stat.mtime).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        }));
        
        // 添加点击事件
        card.addEventListener('click', async () => {
            await openInAppropriateLeaf(this.app,file);
        });
        
        // 添加预览功能
        card.addEventListener('mouseenter', async () => {
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
        
        return card;
    }

    // 周视图导航
    private navigateWeek(delta: number) {
        console.log('导航前 - 年份:', this.currentYear, ':', this.currentWeek, '增量:', delta);
        
        // 保存当的和年份
        let newWeek = this.currentWeek;
        let newYear = this.currentYear;
        
        // 计算新的周数
        newWeek += delta;
        
        // 处理年份更
        const getWeeksInYear = (year: number) => {
            const lastDay = new Date(year, 11, 31);
            const weekNum = this.getWeekNumber(lastDay);
            console.log(`${year}年的总周数:`, weekNum);
            return weekNum;
        };
        
        if (newWeek < 1) {
            newYear--;
            newWeek = getWeeksInYear(newYear);
            console.log('切换到上一年的最后一周');
        } else {
            const weeksInYear = getWeeksInYear(newYear);
            if (newWeek > weeksInYear) {
                newYear++;
                newWeek = 1;
                console.log('切换到下一年的第一周');
            }
        }
        
        // 更新状态
        this.currentYear = newYear;
        this.currentWeek = newWeek;
        
        console.log('导航后 - 年份:', this.currentYear, '周数:', this.currentWeek);
        
        // 更新周信息显示
        const weekInfo = this.containerEl.querySelector('.week-info');
        if (weekInfo) {
            const currentMonth = this.getMonthForWeek(this.currentYear, this.currentWeek);
            weekInfo.setText(`${this.currentYear}年${currentMonth}月 第${this.currentWeek}周`);
        }

        // 清空现有笔记列表
        const notesContainer = this.containerEl.querySelector('.week-notes-container');
        if (notesContainer) {
            notesContainer.empty();
            
            // 获取新的日期范围
            const weekDates = getWeekDates(this.currentYear, this.currentWeek);
            
            // 调整日期顺序，将周日的笔记放到最后
            const reorderedDates = [
                ...weekDates.slice(1), // 周一到周六
                weekDates[0]           // 周日
            ];
            
            // 为每一天创建笔记列表
            reorderedDates.forEach(async date => {
                const dayNotes = notesContainer.createDiv('day-notes-column');
                const notes = await this.getNotesForDate(date);
                
                // 为每个笔记创建卡片
                notes.forEach(note => {
                    const noteCard = this.createWeekNoteCard(note);
                    dayNotes.appendChild(noteCard);
                });
            });
        }
    }

    // 获取指定周所在的月份
    private getMonthForWeek(year: number, week: number): number {
        try {
            const weekDates = getWeekDates(year, week);
            // 使用周中间的日期（周四）来确定月份
            const middleDate = weekDates[3];
            console.log('周中间日期:', middleDate);
            return middleDate.getMonth() + 1; // JavaScript 月份从 0 开始，所以要加 1
        } catch (error) {
            console.error('获取月份失:', error);
            return 1; // 返回默认值
        }
    }

    // 创建主页视图
    private async createHomeView() {
        // console.log('Creating home view...');
        // console.log('Current modules:', this.homeModules);
        
        if (this.currentLoadingView !== 'home') {
            return;
        }

        try {
            this.container.empty();
            const homeContainer = this.container.createDiv('home-container');
            
            // 创建模块网格容器
            const moduleGrid = homeContainer.createDiv('module-grid');
            
            // 创建三列容器
            const leftColumn = moduleGrid.createDiv('left-column');
            const centerColumn = moduleGrid.createDiv('center-column');
            const rightColumn = moduleGrid.createDiv('right-column');
            
            // 按列分组排序可见的模块
            const visibleModules = this.homeModules.filter(m => m.visible);
            console.log('Visible modules:', visibleModules);
            
            if (visibleModules.length === 0) {
                console.log('No visible modules found, using default modules');
                this.homeModules = DEFAULT_HOME_MODULES;
                await this.plugin.saveSettings();
            }
            
            // 分类模块
            const leftModules = visibleModules.filter(m => m.position === 'left')
                .sort((a, b) => a.order - b.order);
            const centerModules = visibleModules.filter(m => m.position === 'center')
                .sort((a, b) => a.order - b.order);
            const rightModules = visibleModules.filter(m => m.position === 'right')
                .sort((a, b) => a.order - b.order);
            
            console.log('Left modules:', leftModules);
            console.log('Center modules:', centerModules);
            console.log('Right modules:', rightModules);

            // 渲左侧列模块
            for (const module of leftModules) {
                console.log('Creating left module:', module.id);
                const moduleEl = await this.createModule(leftColumn, module);
                moduleEl.setAttribute('data-position', 'left');
                this.setupModuleDragging(moduleEl);
            }
            
            // 渲染中间列模块
            for (const module of centerModules) {
                console.log('Creating center module:', module.id);
                const moduleEl = await this.createModule(centerColumn, module);
                moduleEl.setAttribute('data-position', 'center');
                this.setupModuleDragging(moduleEl);
            }
            
            // 渲染右侧列模块
            for (const module of rightModules) {
                console.log('Creating right module:', module.id);
                const moduleEl = await this.createModule(rightColumn, module);
                moduleEl.setAttribute('data-position', 'right');
                this.setupModuleDragging(moduleEl);
            }

        } catch (error: any) {
            console.error('创建主页视图失败:', error);
            console.error(error.stack);  // 添加错误堆栈信息
            new Notice('创建主页视图失败');
        }
    }

    // 创建单个模块
    private async createModule(container: HTMLElement, module: HomeModule): Promise<HTMLElement> {
        const moduleEl = container.createDiv(`module-container ${module.type}-module`);
        moduleEl.setAttribute('data-module-id', module.id); // 添加模块ID
        moduleEl.style.gridColumn = `span ${module.columns || 4}`;
        
        // 创建模块头部
        const header = moduleEl.createDiv('module-header');
        header.createEl('h3', { text: module.name });
        
        // 添加大小调整钮
        const resizeControls = moduleEl.createDiv('module-resize');
        
        // 减小按钮
        const decreaseBtn = resizeControls.createEl('button');
        decreaseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        
        // 增大按钮
        const increaseBtn = resizeControls.createEl('button');
        increaseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        
        // 创建模块内容
        const content = moduleEl.createDiv('module-content');
        await this.renderModuleContent(content, module);

        return moduleEl;
    }

    // 显示模块管理器
    private showModuleManager() {
        const modal = new ModuleManagerModal(this.app, this.homeModules, async (modules) => {
            this.homeModules = modules;
            // 由于CardView类上不存在saveModuleSettings方法，我们将其注释掉
            // this.saveModuleSettings();
            this.createHomeView();
        });
        modal.open();
    }

    // 模块-热力图
    private async renderHeatmap(container: HTMLElement) {
        console.log('Rendering heatmap module...');
        const heatmapContainer = container.createDiv('heatmap-container');
        
        // 获取过去一年的数据
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(endDate.getFullYear() - 1);
        
        // 创建日期到计数的映射
        const dateCountMap = new Map<string, number>();
        
        // 初始化所有日期的计数为0
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            dateCountMap.set(dateStr, 0);
        }
        
        // 统计每天的笔记数量
        const files = this.app.vault.getMarkdownFiles();
        files.forEach(file => {
            const date = new Date(file.stat.mtime);
            if (date >= startDate && date <= endDate) {
                const dateStr = date.toISOString().split('T')[0];
                dateCountMap.set(dateStr, (dateCountMap.get(dateStr) || 0) + 1);
            }
        });
        
        // 创建热力图表格
        const heatmapGrid = heatmapContainer.createDiv('heatmap-grid');
        
        // 添加星期标签
        const weekLabels = heatmapGrid.createDiv('week-labels');
        ['', 'Mon', 'Wed', 'Fri'].forEach(label => {
            weekLabels.createDiv('week-label').setText(label);
        });
        
        // 创建月份标签容器
        const monthLabels = heatmapGrid.createDiv('month-labels');
        
        // 创建日期格子容器
        const daysContainer = heatmapGrid.createDiv('days-container');
        
        // 获取开始日期是星期几0是周日，1是周一）
        let currentDate = new Date(startDate);
        let currentMonth = currentDate.getMonth();
        
        // 创建月份标签
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let monthDiv = monthLabels.createDiv('month-label');
        monthDiv.setText(months[currentMonth]);
        
        // 创建日期格子
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const count = dateCountMap.get(dateStr) || 0;
            
            // 创建日期格子
            const dayCell = daysContainer.createDiv('day-cell');
            dayCell.setAttribute('data-date', dateStr);
            dayCell.setAttribute('data-count', count.toString());
            
            // 根据计数设置颜色深浅
            let colorClass = 'level-0';
            if (count > 0) {
                if (count >= 5) colorClass = 'level-4';
                else if (count >= 3) colorClass = 'level-3';
                else if (count >= 2) colorClass = 'level-2';
                else colorClass = 'level-1';
            }
            dayCell.addClass(colorClass);
            
            // 添加悬停提示
            dayCell.setAttribute('title', `${dateStr}: ${count} contributions`);
            
            // 检查是否需要添加新的月份标签
            const newMonth = currentDate.getMonth();
            if (newMonth !== currentMonth) {
                currentMonth = newMonth;
                monthDiv = monthLabels.createDiv('month-label');
                monthDiv.setText(months[currentMonth]);
            }
            
            // 移到下一天
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    // 模块-本周笔记
    private async renderWeeklyNotes(container: HTMLElement) {
        console.log('Rendering weekly notes module...');
        const weeklyContainer = container.createDiv('weekly-notes');
        const weekStart = getStartOfWeek();
        const weekEnd = getEndOfWeek();
        
        const notes = this.app.vault.getMarkdownFiles()
            .filter(file => {
                const mtime = new Date(file.stat.mtime);
                return mtime >= weekStart && mtime <= weekEnd;
            })
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, 10);

        for (const note of notes) {
            const noteItem = weeklyContainer.createDiv('note-item');
            noteItem.createEl('span', { text: note.basename, cls: 'note-title' });
            noteItem.createEl('span', { 
                text: new Date(note.stat.mtime).toLocaleDateString(),
                cls: 'note-date'
            });
            
            noteItem.addEventListener('click', () => {
                openInAppropriateLeaf(this.app,note);
            });
        }
    }

    // 模块-日历
    private async renderCalendarModule(container: HTMLElement) {
        container.empty(); // 清空容器
        const moduleContainer = container.createDiv('calendar-module');
        
        // 创建左右布局
        const calendarSection = moduleContainer.createDiv('calendar-section');
        const notesSection = moduleContainer.createDiv('notes-section');
        
        // 创建日历部分
        const calendarContainer = calendarSection.createDiv('calendar-container');
        
        // 创建日历头部
        const header = calendarContainer.createDiv('calendar-header');
        
        // 上个月按钮
        const prevBtn = header.createEl('button', { cls: 'calendar-nav-btn' });
        prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        
        // 显示年月
        const titleEl = header.createDiv('calendar-title');
        titleEl.setText(`${this.currentDate.getFullYear()}年${this.currentDate.getMonth() + 1}月`);
        
        // 下个月按钮
        const nextBtn = header.createEl('button', { cls: 'calendar-nav-btn' });
        nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

        // 添加今天按钮
        const todayBtn = header.createEl('button', { cls: 'calendar-today-btn' });
        todayBtn.innerText = '今天';

        // 点击今天按钮时跳转到今年的月份，并高亮今天的日期
        todayBtn.addEventListener('click', () => {
            this.currentDate.setFullYear(new Date().getFullYear());
            this.currentDate.setMonth(new Date().getMonth());
            this.renderCalendarModule(container);
            const today = new Date().getDate();
            const dayElements = document.querySelectorAll('.calendar-grid .day');
            dayElements.forEach(day => {
                if (day.textContent === today.toString()) {
                    day.classList.add('today');
                }
            });
        });


        // 添加滚轮事件到标题元素
        titleEl.addEventListener('wheel', (e) => {
            e.preventDefault(); // 防止页面滚动
            
            // 向上滚动切换到下个月，向下滚动切换到上个月
            if (e.deltaY < 0) {
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            } else {
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            }
            
            // 重新渲染日历
            this.renderCalendarModule(container);
        });

        // 添加鼠标悬停样式提示
        titleEl.setAttribute('title', '滚动鼠标滚轮切换月份');
        titleEl.addClass('scrollable');

        // 创建星期头部
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekHeader = calendarContainer.createDiv('calendar-weekdays');
        weekdays.forEach(day => {
            weekHeader.createDiv('weekday').setText(day);
        });

        // 创建日历网格
        const grid = calendarContainer.createDiv('calendar-grid');
        
        // 获取当月的笔记
        const notesByDate = this.getNotesByDate(
            this.currentDate.getFullYear(),
            this.currentDate.getMonth()
        );
        
        // 填充日期格子
        this.renderCalendarDays(grid, notesByDate, notesSection);
        
        // 添加导航事件
        prevBtn.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.renderCalendarModule(container);
        });
        
        // 下个月按钮
        nextBtn.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.renderCalendarModule(container);
        });

        // 鼠标离开笔记区域时隐藏笔记区域
        notesSection.addEventListener('mouseleave', (event) => {
            console.log('mouseleave',event);
            notesSection.classList.remove('active');
        });

    }


   

    // 渲染日历天数
    private renderCalendarDays(grid: HTMLElement, notesByDate: Record<string, TFile[]>, notesSection: HTMLElement) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();
        
        // 填充前置空白日期
        for (let i = 0; i < firstDay; i++) {
            grid.createDiv('calendar-day empty');
        }
        
        // 填充日期格子
        for (let day = 1; day <= lastDay; day++) {
            const dateCell = grid.createDiv('calendar-day');
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // 检查是否是今天
            const today = new Date();
            if (today.getFullYear() === year && 
                today.getMonth() === month && 
                today.getDate() === day) {
                dateCell.addClass('today');
            }
            
            // 添加日期数字
            dateCell.createDiv('day-number').setText(String(day));
            
            // 如果有笔，添加标记
            const dayNotes = notesByDate[dateStr] || [];
            if (dayNotes.length >0) {
                dateCell.createDiv('note-count').setText(dayNotes.length.toString());
            }
            
            // 显示当天的笔记和所在文件夹
            const displayNotesForDate = (dateStr: string, dayNotes: TFile[]) => {
                notesSection.empty();
                if (dayNotes.length > 0) {
                    const dateTitle = notesSection.createDiv('date-title');
                    dateTitle.setText(`${dateStr} 的笔记`);
                    
                    const notesList = notesSection.createDiv('notes-list');
                    dayNotes.forEach(note => {
                        const noteItem = notesList.createDiv('note-item');

                        noteItem.setText(`${note.basename}`);
                        noteItem.title = (`${note.parent ? note.parent.path : '未知路径'}`);
                        
                        noteItem.addEventListener('click', () => {
                            openInAppropriateLeaf(this.app, note);
                        });
                    });
                } else {
                    notesSection.createDiv('empty-message')
                        .setText('当天没有笔记');
                }
            };

            // 添加鼠标事件
            dateCell.addEventListener('mouseenter', () => {
                if (!notesSection.classList.contains('active') ) {
                   displayNotesForDate(dateStr, dayNotes);
                } 
            });

            // 添加鼠标点击件
            dateCell.addEventListener('click', () => {

                // 显示当天的笔记
                displayNotesForDate(dateStr, dayNotes);

                // 如果点击的是同一个，则切换selected
                if (dateCell.classList.contains('selected')) {
                    dateCell.classList.remove('selected');
                    notesSection.classList.remove('active');
                } else {
                    // 如果不是则移除其他的
                    document.querySelectorAll('.calendar-module .calendar-grid .calendar-day.selected').forEach(el => {
                        el.classList.remove('selected');
                        notesSection.classList.remove('active');
                    });
                    // 给点击的添加selected
                    dateCell.classList.add('selected');
                    notesSection.classList.add('active');
                }
            });

        }
    }


    // 保存模块设置
    private async saveModuleSettings() {
        // 保存到插件设置中
        await this.plugin.saveHomeModules(this.homeModules);
    }

    // 渲染模块内容
    private async renderModuleContent(container: HTMLElement, module: HomeModule) {
        console.log('Rendering module:', module.type);
        try {
        switch (module.type) {
            case 'heatmap':
                await this.renderHeatmap(container);
                break;
            case 'weekly':
                await this.renderWeeklyNotes(container);
                break;
            case 'stats':
                await renderStats(this.app,container);
                break;
            case 'calendar':
                await this.renderCalendarModule(container);
                break;
            case 'quicknote':
                await this.renderQuickNoteModule(container);
                break;
            case 'todo':
                await this.renderTodoModule(container);
                break;
                default:
                    console.warn('Unknown module type:', module.type);
                    container.createDiv('module-error').setText(`Unknown module type: ${module.type}`);
            }
        } catch (error: any) {
            console.error('Error rendering module:', module.type, error);
            console.error(error.stack);
            container.createDiv('module-error').setText(`Error loading ${module.type} module: ${error.message}`);
        }
    }

    // 切换模块
    private toggleModuleEditing(enable: boolean) {
        console.log('切换模块编辑:', enable);
        
        const modules = this.container.querySelectorAll('.module-container');
        const columns = this.container.querySelectorAll('.left-column, .center-column, .right-column');
        
        if (enable) {
            // 启用编辑模式
            modules.forEach(module => {
                if (module instanceof HTMLElement) {
                    // 先移除可能存在的旧控件
                    module.querySelectorAll('.module-drag-handle, .module-controls').forEach(el => el.remove());
                    
                    module.classList.add('editable');
                    this.setupModuleDragging(module); // 设置拖拽
                }
            });

            columns.forEach(column => {
                column.classList.add('editable');
            });
        } else {
            // 禁用编辑模式
            modules.forEach(module => {
                if (module instanceof HTMLElement) {
                    // 移除编辑模式类和所有控制元素
                    module.classList.remove('editable');
                    module.querySelectorAll('.module-drag-handle, .module-controls').forEach(el => el.remove());
                    
                    // 清理所有拖拽相关的样式
                    module.style.position = '';
                    module.style.zIndex = '';
                    module.style.width = '';
                    module.style.left = '';
                    module.style.top = '';
                    module.style.transform = '';
                    module.style.cursor = '';
                    module.classList.remove('dragging');
                    
                    // 通过克隆节点来移除所有事件监听器
                    const newModule = module.cloneNode(true) as HTMLElement;
                    if (module.parentNode) {
                        // 保存原有的内容元素
                        const content = module.querySelector('.module-content');
                        const newContent = newModule.querySelector('.module-content');
                        
                        if (content && newContent) {
                            // 替换内容元素，保持原有的事件监听器
                            newContent.replaceWith(content);
                        }
                        
                        // 替换整个模块
                        module.parentNode.replaceChild(newModule, module);
                    }
                }
            });

            columns.forEach(column => {
                column.classList.remove('editable');
                column.classList.remove('drop-target');
                column.querySelectorAll('.drop-marker').forEach(marker => marker.remove());
            });

            // 移除所有占位符和标记
            this.container.querySelectorAll('.module-placeholder, .drop-marker').forEach(el => el.remove());

            // 重新渲染主页视图，但不进入编辑模式
            this.createHomeView();
        }

        console.log('模块编辑切换完成');
    }

    // 设置模块拖拽
    private setupModuleDragging(module: HTMLElement) {
        console.log('设置模块拖拽:', module);
        
        // 检查模块是否有 editable 类
        if (!module.classList.contains('editable')) {
            console.log('模块不是可编辑的,跳过拖拽设置');
            return;
        }

        let isDragging = false;
        let startX: number;
        let startY: number;
        let startPosition: string;
        let startIndex: number;
        let placeholder: HTMLElement | null = null;
        let dropTarget: HTMLElement | null = null;

        // 添加拖拽手柄到左上角
        const dragHandle = document.createElement('div');
        dragHandle.className = 'module-drag-handle visible'; // 添加 visible 类
        dragHandle.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12h18M3 6h18M3 18h18"></path>
            </svg>
        `;
        module.appendChild(dragHandle);

        // 添加上下移动按钮到右角
        const moduleControls = document.createElement('div');
        moduleControls.className = 'module-controls visible'; // 添加 visible 类
        
        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'move-up-btn';
        moveUpBtn.innerHTML = '↑';
        moveUpBtn.title = '向上移动';
        moveUpBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            console.log('点击向上移动按钮');
            this.moveModule(module, 'up');
        });

        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'move-down-btn';
        moveDownBtn.innerHTML = '↓';
        moveDownBtn.title = '向下移动';
        moveDownBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            console.log('点击向下移动按钮');
            this.moveModule(module, 'down');
        });

        moduleControls.appendChild(moveUpBtn);//向上移动按钮
        moduleControls.appendChild(moveDownBtn);//向下移动按钮
        module.appendChild(moduleControls);//添加到模块上

        // 定义拖拽开始函数
        const startDrag = (e: MouseEvent) => {
            console.log('开始拖拽', e.target); 
            
            // 检查点击目标
            if (e.target instanceof HTMLElement && (
                e.target.closest('.module-controls') ||
                e.target.closest('input') ||
                e.target.closest('textarea') ||
                e.target.closest('button')
            )) {
                console.log('点击了交互元素,忽略拖拽');
                return;
            }

            isDragging = true;
            startX = e.pageX;
            startY = e.pageY;
            startPosition = module.getAttribute('data-position') || '';
            startIndex = Array.from(module.parentElement?.children || []).indexOf(module);

            // 记录模块原始尺寸
            const rect = module.getBoundingClientRect();
            const originalWidth = rect.width;
            const originalHeight = rect.height;

            console.log('拖拽开始:', { 
                startX,
                startY,
                startPosition,
                startIndex,
                originalWidth,
                originalHeight
            });

            // 创建占位符
            placeholder = document.createElement('div');
            placeholder.className = 'module-placeholder';
            placeholder.style.height = `${originalHeight}px`;
            placeholder.style.width = `${originalWidth}px`;
            module.parentElement?.insertBefore(placeholder, module);
            console.log('创建占位符');

            // 设置拖拽样式
            module.style.position = 'fixed';
            module.style.zIndex = '1000';
            module.style.width = `${originalWidth}px`; // 使用固定宽度
            module.style.height = `${originalHeight}px`; // 使用固定高度
            module.style.left = `${rect.left}px`;
            module.style.top = `${rect.top}px`;
            module.classList.add('dragging');
            console.log('应用拖拽样式');

            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', stopDrag);

            e.preventDefault();
            e.stopPropagation();
        };

        // 定义拖拽过程函数
        const handleDrag = (e: MouseEvent) => {
            if (!isDragging) return;
            console.log('拖拽中:', e.pageX, e.pageY);

            const dx = e.pageX - startX;
            const dy = e.pageY - startY;
            
            // 更新模块位置
            module.style.transform = `translate(${dx}px, ${dy}px)`;

            // 获取所有列容器
            const columns = [
                this.container.querySelector('.left-column'),
                this.container.querySelector('.center-column'),
                this.container.querySelector('.right-column')
            ].filter((col): col is HTMLElement => col instanceof HTMLElement);

            // 清除所有放置标记
            this.container.querySelectorAll('.drop-marker').forEach(marker => marker.remove());
            columns.forEach(col => col.classList.remove('drop-target'));

            // 检查鼠标位并更新放置标记
            for (const column of columns) {
                const rect = column.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    
                    // 找到目标列
                    dropTarget = column;
                    column.classList.add('drop-target');

                    // 获取列中的所有模块
                    const modules = Array.from(column.children).filter(child => 
                        child.classList.contains('module-container') && 
                        child !== module && 
                        child !== placeholder
                    );

                    // 找到最近的模块和插入位置
                    let insertBefore: Element | null = null;
                    let insertPosition: 'before' | 'after' = 'before';

                    for (const targetModule of modules) {
                        const targetRect = targetModule.getBoundingClientRect();
                        const targetMiddle = targetRect.top + targetRect.height / 2;

                        if (e.clientY < targetMiddle) {
                            insertBefore = targetModule;
                            insertPosition = 'before';
                            break;
                        } else {
                            insertBefore = targetModule.nextElementSibling;
                            insertPosition = 'after';
                        }
                    }

                    // 创建放置标记
                    const marker = document.createElement('div');
                    marker.className = 'drop-marker';
                    
                    if (modules.length === 0) {
                        // 如果列为空，显示一个水平线
                        marker.style.width = '100%';
                        marker.style.height = '2px';
                        column.appendChild(marker);
                    } else {
                        // 在目标位置显示一个水平线
                        marker.style.width = '100%';
                        marker.style.height = '2px';
                        if (insertBefore) {
                            column.insertBefore(marker, insertBefore);
                        } else {
                            column.appendChild(marker);
                        }
                    }

                    // 移动占位符
                    if (placeholder) {
                        if (insertBefore) {
                            column.insertBefore(placeholder, insertBefore);
                        } else {
                            column.appendChild(placeholder);
                        }
                    }

                    break;
                }
            }
        };

        // 定义拖拽结束函数
        const stopDrag = async () => {
            if (!isDragging) return;
            console.log('停止拖拽');
            
            isDragging = false;

            try {
                // 如果有占位符，使用占位符的位置来确定目标位置
                if (placeholder && placeholder.parentElement) {
                    const targetColumn = placeholder.parentElement;
                    const newPosition = targetColumn.classList.contains('left-column') ? 'left'
                        : targetColumn.classList.contains('right-column') ? 'right'
                        : 'center';

                    // 更新模块配置
                    const moduleId = module.getAttribute('data-module-id');
                    const moduleConfig = this.homeModules.find(m => m.id === moduleId);
                    
                    if (moduleConfig) {
                        // 先重置模块样式，这样模块就会回到文档流中
                        module.style.position = '';
                        module.style.zIndex = '';
                        module.style.left = '';
                        module.style.top = '';
                        module.style.transform = '';
                        module.style.width = '';
                        module.style.height = '';
                        module.classList.remove('dragging');

                        // 然后移动模块到目标位置
                        targetColumn.insertBefore(module, placeholder);

                        // 更新位置和列数
                        moduleConfig.position = newPosition;
                        moduleConfig.columns = newPosition === 'center' ? 2 : 1;

                        // 更新顺序
                        const sameColumnModules = this.homeModules
                            .filter(m => m.position === newPosition);

                        // 获取新的索引位置
                        const newIndex = Array.from(targetColumn.children)
                            .filter(child => child.classList.contains('module-container'))
                            .indexOf(module);

                        // 更新顺序
                        moduleConfig.order = newIndex;
                        sameColumnModules.forEach((m, i) => {
                            if (i >= newIndex && m.id !== moduleConfig.id) {
                                m.order = i + 1;
                            }
                        });

                        // 保存更新
                        await this.saveModuleSettings();
                    }
                }

                // 移除占位符和标记
                placeholder?.remove();
                this.container.querySelectorAll('.drop-marker').forEach(marker => marker.remove());
                this.container.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

            } catch (error) {
                console.error('拖拽结束处理错误:', error);
                // 确保清理样式和占位符
                module.style.position = '';
                module.style.zIndex = '';
                module.style.left = '';
                module.style.top = '';
                module.style.transform = '';
                module.style.width = '';
                module.style.height = '';
                module.classList.remove('dragging');
                placeholder?.remove();
            }
        };

        // 添加拖拽事件监听
        console.log('添加拖拽事件监听');
        dragHandle.addEventListener('mousedown', (e: Event) => {
            console.log('拖拽手柄mousedown');
            if (e instanceof MouseEvent) {
                startDrag(e);
            }
        });

        module.addEventListener('mousedown', (e: Event) => {
            console.log('Module mousedown');
            if (e instanceof MouseEvent) {
                startDrag(e);
            }
        });

        console.log('模块拖拽设置完成');
    }

    // 添加移动模块的方法
    private moveModule(module: HTMLElement, direction: 'up' | 'down') {
        console.log('移动模块:', direction);
        
        const moduleId = module.getAttribute('data-module-id');
        const moduleConfig = this.homeModules.find(m => m.id === moduleId);
        if (!moduleConfig) {
            console.log('未找到模块配置');
            return;
        }

        const currentPosition = moduleConfig.position;
        const sameColumnModules = this.homeModules
            .filter(m => m.position === currentPosition)
            .sort((a, b) => a.order - b.order);

        console.log('同列模块:', sameColumnModules);
        
        const currentIndex = sameColumnModules.indexOf(moduleConfig);
        if (currentIndex === -1) {
            console.log('未找到当前模块索引');
            return;
        }

        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (newIndex < 0 || newIndex >= sameColumnModules.length) {
            console.log('新索引超出范围:', newIndex);
            return;
        }

        // 交换顺序
        const targetModule = sameColumnModules[newIndex];
        console.log('交换顺序:', {
            current: moduleConfig.order,
            target: targetModule.order
        });
        
        const tempOrder = moduleConfig.order;
        moduleConfig.order = targetModule.order;
        targetModule.order = tempOrder;

        // 保存更新并重新渲染
        this.saveModuleSettings();
        this.createHomeView().then(() => {
            // 重新应用编辑模式
            const modules = this.container.querySelectorAll('.module-container');
            modules.forEach(m => {
                if (m instanceof HTMLElement) {
                    m.classList.add('editable');
                    this.setupModuleDragging(m);
                }
            });
        });
    }

    // 更新模块位置
    private updateModulePosition(module: HTMLElement, newPosition: 'left' | 'center' | 'right') {
        const moduleId = module.getAttribute('data-module-id');
        const moduleConfig = this.homeModules.find(m => m.id === moduleId);
        
        if (moduleConfig) {
            console.log('更新模块位置:', {
                from: moduleConfig.position,
                to: newPosition
            });

            // 更新位置和列数
            moduleConfig.position = newPosition;
            moduleConfig.columns = newPosition === 'center' ? 2 : 1;

            // 更新顺序（添加到目标列的末尾）
            const sameColumnModules = this.homeModules
                .filter(m => m.position === newPosition)
                .sort((a, b) => a.order - b.order);
            
            moduleConfig.order = sameColumnModules.length;

            // 保存更新
            this.saveModuleSettings();

            // 重新渲染主页视图并保持编模式
            this.createHomeView().then(() => {
                // 重新应用编辑模式
                const modules = this.container.querySelectorAll('.module-container');
                modules.forEach(m => {
                    if (m instanceof HTMLElement) {
                        m.classList.add('editable');
                        this.setupModuleDragging(m);
                    }
                });
            });
        }
    }

    // 清理模块编辑
    private cleanupModuleEditing(module: HTMLElement) {
        // 移除所有调整大小的手柄
        module.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
        
        // 清除拖拽相关的样式
        module.style.transform = '';
        module.style.zIndex = '';
        module.style.opacity = '';
        module.classList.remove('module-dragging'); // 添加这行，移除拖拽时的样式类
        
        // 移除虚线边
        module.style.border = '1px solid var(--background-modifier-border)'; // 恢复默认边框样式
    }
    

    // 模块-快速笔记
    private async renderQuickNoteModule(container: HTMLElement) {
        const quickNoteContainer = container.createDiv('quicknote-module');
        
        // 创建输入容器
        const inputContainer = quickNoteContainer.createDiv('quick-note-input-container');

        // 创建标题输入框
        const titleInput = inputContainer.createEl('input', {
            cls: 'quick-note-title',
            attr: {
                placeholder: '输入笔标题...',
                type: 'text'
            }
        });

        // 创建内容输入框
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
            码
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

        // 添加送按钮
        const sendButton = inputContainer.createEl('button', {
            cls: 'quick-note-send',
            attr: {
                'title': '送记'
            }
        });
        sendButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        `;

        // 发送按钮事件
        sendButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const title = titleInput.value.trim();
            const content = noteInput.value.trim();
            
            if (!content) {
                new Notice('请输入笔记内容');
                return;
            }

            try {
                // 获取所有添加的标签
                const tagItems = tagsContainer.querySelectorAll('.tag-item');
                const tagTexts = Array.from(tagItems).map(item => item.textContent?.replace('×', '').trim() ?? '');
                
                // 构建笔记内容包含标签
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
                    // 清理输入状态
                    this.clearQuickNoteInputs(titleInput, noteInput, tags, tagsContainer, tagInput);
                    
                    new Notice('笔记创建成功');
                }
            } catch (error) {
                console.error('创建笔记失败:', error);
                new Notice('创建笔记失败');
            }
        });
    }

    // 模块-待办事项
    private async renderTodoModule(container: HTMLElement) {
        const todoContainer = container.createDiv('todo-module');
        
        // 创建分类标签
        const tabs = todoContainer.createDiv('todo-tabs');
        const allTab = tabs.createDiv('todo-tab active');
        allTab.setText('全部');
        const pendingTab = tabs.createDiv('todo-tab');
        pendingTab.setText('待完成');
        const completedTab = tabs.createDiv('todo-tab');
        completedTab.setText('已完成');


        // 创建输入区域
        const inputArea = todoContainer.createDiv('todo-input-area');
        
        // 创建输入框
        const input = inputArea.createEl('input', {
            type: 'text',
            placeholder: '添加新的待办事项...',
            cls: 'todo-input'
        });

        // 创建日期选择器
        const dateInput = inputArea.createEl('input', {
            type: 'date',
            cls: 'todo-date-input'
        });

        // 创建添加按钮
        const addButton = inputArea.createEl('button', {
            text: '添加',
            cls: 'todo-add-btn'
        });

        // 创建待办事列表容器
        const todoList = todoContainer.createDiv('todo-list');
        

        // 加载保存的待办事项
        const todos = await this.loadTodos();
        this.renderTodoList(todoList, todos, 'all');

        // 添加事件处理
        addButton.addEventListener('click', async () => {
            const content = input.value.trim();
            const dueDate = dateInput.value;
            if (content) {
                const newTodo = {
                    id: Date.now().toString(),
                    content,
                    completed: false,
                    dueDate: dueDate || undefined,
                    createdAt: new Date().toISOString()
                };
                
                todos.push(newTodo);
                await this.saveTodos(todos);
                this.renderTodoList(todoList, todos, 'all');
                
                input.value = '';
                dateInput.value = '';
            }
        });

        // 添加回车键处理
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addButton.click();
            }
        });

        // 添加标签切换事件
        allTab.addEventListener('click', () => {
            tabs.querySelectorAll('.todo-tab').forEach(tab => tab.removeClass('active'));
            allTab.addClass('active');
            this.renderTodoList(todoList, todos, 'all');
        });

        // 待完成标签事件
        pendingTab.addEventListener('click', () => {
            tabs.querySelectorAll('.todo-tab').forEach(tab => tab.removeClass('active'));
            pendingTab.addClass('active');
            this.renderTodoList(todoList, todos, 'pending');
        });

        // 完成标签事件
        completedTab.addEventListener('click', () => {
            tabs.querySelectorAll('.todo-tab').forEach(tab => tab.removeClass('active'));
            completedTab.addClass('active');
            this.renderTodoList(todoList, todos, 'completed');
        });
    }

    // 加载待办事项
    private async loadTodos(): Promise<any[]> {
        try {
            const data = await this.plugin.loadData();
            return data?.todos || [];
        } catch (error) {
            console.error('加载待办事项失败:', error);
            return [];
        }
    }

    // 保存待办事项
    private async saveTodos(todos: any[]) {
        try {
            const data = await this.plugin.loadData() || {};
            data.todos = todos;
            await this.plugin.saveData(data);
        } catch (error) {
            console.error('保存待办事项失败:', error);
        }
    }

    // 渲染待办事项列表
    private renderTodoList(container: HTMLElement, todos: any[], filter: 'all' | 'pending' | 'completed') {
        container.empty();
        
        const filteredTodos = todos.filter((todo: any) => {
            if (filter === 'all') return true;
            if (filter === 'pending') return !todo.completed;
            if (filter === 'completed') return todo.completed;
            return true;
        });

        filteredTodos.forEach(todo => {
            const todoItem = container.createDiv('todo-item');
            
            // 创建复选框
            const checkbox = todoItem.createEl('input', {
                type: 'checkbox',
                cls: 'todo-checkbox'
            });
            checkbox.checked = todo.completed;
            
            // 创建内容区域
            const content = todoItem.createDiv('todo-content');
            content.setText(todo.content);
            if (todo.completed) {
                content.addClass('completed');
            }
            
            // 如果有截止日期，显示日期
            if (todo.dueDate) {
                const dueDate = todoItem.createDiv('todo-due-date');
                const date = new Date(todo.dueDate);
                dueDate.setText(date.toLocaleDateString());
                
                // 如果已过期且未完成，添加过期样式
                if (!todo.completed && date < new Date()) {
                    dueDate.addClass('overdue');
                }
            }
            
            // 创建删除按钮
            const deleteBtn = todoItem.createDiv('todo-delete-btn');
            deleteBtn.setText('×');
            
            // 添加事件处理
            checkbox.addEventListener('change', async () => {
                todo.completed = checkbox.checked;
                content.toggleClass('completed', todo.completed);
                await this.saveTodos(todos);
            });
            
            deleteBtn.addEventListener('click', async () => {
                const index = todos.findIndex(t => t.id === todo.id);
                if (index !== -1) {
                    todos.splice(index, 1);
                    await this.saveTodos(todos);
                    this.renderTodoList(container, todos, filter);
                }
            });
        });
    }

    // 在 CardView 类中添以下方法

    // 显示网格对齐指示器
    private showGridSnapIndicator(module: HTMLElement, width: number) {
        let indicator = this.container.querySelector('.grid-snap-indicator');
        if (!indicator) {
            indicator = this.container.createDiv('grid-snap-indicator');
        }
        
        const rect = module.getBoundingClientRect();
        if (indicator instanceof HTMLElement) {
            indicator.style.top = `${rect.top}px`;
            indicator.style.left = `${rect.left}px`;
            indicator.style.width = `${width}px`;
            indicator.style.height = `${rect.height}px`;
            indicator.style.display = 'block';
        }
    }

    // 隐藏网格对齐指示器
    private hideGridSnapIndicator() {
        const indicator = this.container.querySelector('.grid-snap-indicator');
        if (indicator instanceof HTMLElement) {
            indicator.style.display = 'none';
        }
    }


}

// 模块管理-弹窗
class ModuleManagerModal extends Modal {
    private modules: HomeModule[];
    private onSave: (modules: HomeModule[]) => void;
    private previewContainer: HTMLElement;
    
    constructor(app: App, modules: HomeModule[], onSave: (modules: HomeModule[]) => void) {
        super(app);
        this.modules = [...modules];
        this.onSave = onSave;
        this.previewContainer = createDiv(); // 初始化 previewContainer
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: '管理主页模块' });
        
        // 添加预览容
        this.previewContainer = contentEl.createDiv('preview-container');
        this.updatePreview();
        
        const moduleList = contentEl.createDiv('module-list');
        
        this.modules.forEach((module, index) => {
            const moduleItem = moduleList.createDiv('module-item');
            
            // 添加拖动手
            moduleItem.createDiv('drag-handle').innerHTML = '⋮⋮';
            
            // 添加可见性切换
            const visibilityToggle = moduleItem.createEl('input', {
                type: 'checkbox',
                attr: { checked: module.visible }
            } as any);
            visibilityToggle.addEventListener('change', () => {
                this.modules[index].visible = visibilityToggle.checked;
            });
            
            // 添加模块名称
            moduleItem.createEl('span', { text: module.name });
            
            // 添加上下移动按钮
            const moveUp = moduleItem.createEl('button', { text: '↑' });
            const moveDown = moduleItem.createEl('button', { text: '↓' });
            
            moveUp.addEventListener('click', () => this.moveModule(index, -1));
            moveDown.addEventListener('click', () => this.moveModule(index, 1));
        });
        
        // 添加保存按钮
        const saveBtn = contentEl.createEl('button', {
            text: '保存',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => {
            this.onSave(this.modules);
            this.close();
        });
    }

    // 移动模块
    private moveModule(index: number, direction: number) {
        const newIndex = index + direction;
        if (newIndex >= 0 && newIndex < this.modules.length) {
            const temp = this.modules[index];
            this.modules[index] = this.modules[newIndex];
            this.modules[newIndex] = temp;
            // 更新顺序
            this.modules.forEach((m, i) => m.order = i);
            // 重新渲染列
            this.onOpen();
        }
    }

    // 添加预览更新方法
    private updatePreview() {
        this.previewContainer.empty();
        const previewGrid = this.previewContainer.createDiv('module-grid');
        
        this.modules
            .filter(m => m.visible)
            .sort((a, b) => a.order - b.order)
            .forEach(module => {
                const modulePreview = previewGrid.createDiv('module-preview');
                modulePreview.style.gridColumn = `span ${module.columns || 4}`;
                modulePreview.createEl('h4', { text: module.name });
            });
    }
}

// 默认主页模块配置
export const DEFAULT_HOME_MODULES: HomeModule[] = [
    {
        id: 'quicknote',
        name: '快速笔记',
        type: 'quicknote',
        visible: true,
        order: 0,
        columns: 2,
        position: 'center'
    },
    {
        id: 'heatmap',
        name: '活动热力图',
        type: 'heatmap',
        visible: true,
        order: 1,
        columns: 1,
        position: 'left'
    },
    {
        id: 'stats',
        name: '笔记统计',
        type: 'stats',
        visible: true,
        order: 2,
        columns: 1,
        position: 'right'
    },
    {
        id: 'weekly',
        name: '本周笔记',
        type: 'weekly',
        visible: true,
        order: 3,
        columns: 1,
        position: 'left'
    },
    {
        id: 'calendar',
        name: '日历',
        type: 'calendar',
        visible: true,
        order: 4,
        columns: 2,
        position: 'center'
    },
    {
        id: 'todo',
        name: '待办事项',
        type: 'todo',
        visible: true,
        order: 5,
        columns: 1,
        position: 'right'
    }
];

