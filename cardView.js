"use strict";
(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // cardView.ts
  var import_obsidian = __require("obsidian");
  var VIEW_TYPE_CARD = "card-view";
  var CardView = class extends import_obsidian.ItemView {
    /**
     * 构造函数
     * @param leaf - 工作区叶子节点
     * @param plugin - 插件实例
     */
    constructor(leaf, plugin) {
      super(leaf);
      this.container = createDiv();
      this.tagContainer = createDiv();
      this.contentContainer = createDiv();
      this.previewContainer = createDiv();
      this.previewResizer = createDiv();
      this.isPreviewCollapsed = false;
      this.currentFolder = null;
      this.searchInput = createEl("input");
      this.currentSearchTerm = "";
      this.selectedTags = /* @__PURE__ */ new Set();
      this.selectedNotes = /* @__PURE__ */ new Set();
      this.lastSelectedNote = null;
      this.recentFolders = [];
      this.cardSize = 280;
      // 默认卡片宽度
      this.MIN_CARD_SIZE = 280;
      // 最小卡片宽度
      this.MAX_CARD_SIZE = 600;
      // 最大卡片宽度
      this.calendarContainer = createDiv();
      this.isCalendarVisible = false;
      this.currentDate = /* @__PURE__ */ new Date();
      this.currentFilter = { type: "none" };
      this.plugin = plugin;
      this.currentView = plugin.settings.defaultView;
    }
    /**
     * 获取视图类型
     * @returns 视图类型标识符
     */
    getViewType() {
      return VIEW_TYPE_CARD;
    }
    /**
     * 获取视图显示文本
     * @returns 显示在标签页上的文本
     */
    getDisplayText() {
      return "\u5361\u7247\u89C6\u56FE";
    }
    /**
     * 视图打开时的初始化函数
     * 创建标签过滤器、视图切换按钮和容器
     */
    async onOpen() {
      const { containerEl } = this;
      containerEl.empty();
      containerEl.addClass("card-view-container");
      const mainLayout = containerEl.createDiv("main-layout");
      const contentSection = mainLayout.createDiv("content-section");
      const toolbar = contentSection.createDiv("card-view-toolbar");
      const leftTools = toolbar.createDiv("toolbar-left");
      const newNoteBtn = leftTools.createEl("button", {
        cls: "new-note-button"
      });
      newNoteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>\u65B0\u5EFA\u7B14\u8BB0</span>
        `;
      newNoteBtn.addEventListener("click", () => this.createNewNote());
      this.createCalendarButton(leftTools);
      const viewSwitcher = leftTools.createDiv("view-switcher");
      this.createViewSwitcher(viewSwitcher);
      const searchContainer = toolbar.createDiv("search-container");
      this.searchInput = searchContainer.createEl("input", {
        type: "text",
        placeholder: "\u641C\u7D22\u7B14\u8BB0...",
        cls: "search-input"
      });
      this.searchInput.addEventListener("input", () => {
        this.currentSearchTerm = this.searchInput.value;
        this.refreshView();
      });
      this.tagContainer = contentSection.createDiv("tag-filter");
      await this.loadTags();
      const contentArea = contentSection.createDiv("card-view-content");
      this.container = contentArea.createDiv("card-container");
      this.cardSize = this.plugin.settings.cardWidth;
      this.container.style.gridTemplateColumns = `repeat(auto-fill, ${this.cardSize}px)`;
      const previewWrapper = mainLayout.createDiv("preview-wrapper");
      this.previewContainer = previewWrapper.createDiv("preview-container");
      const previewControls = previewWrapper.createDiv("preview-controls");
      const toggleButton = previewControls.createEl("button", {
        cls: "preview-toggle",
        attr: { "aria-label": "\u6298\u53E0\u9884\u89C8" }
      });
      toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-right"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      toggleButton.addEventListener("click", () => this.togglePreview());
      this.previewResizer = previewWrapper.createDiv("preview-resizer");
      this.setupResizer();
      document.addEventListener("wheel", (e) => {
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
    async loadTags() {
      const tags = this.getAllTags();
      const allTagBtn = this.tagContainer.createEl("button", {
        text: "All",
        cls: "tag-btn active"
        // 默认选中
      });
      allTagBtn.addEventListener("click", () => {
        this.clearTagSelection();
        allTagBtn.addClass("active");
        this.refreshView();
      });
      tags.forEach((tag) => {
        const tagBtn = this.tagContainer.createEl("button", {
          text: tag,
          cls: "tag-btn"
        });
        tagBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleTag(tag, tagBtn);
        });
      });
    }
    /**
     * 获取所有笔记中的标签
     * @returns 去重后的标签数组
     */
    getAllTags() {
      const tags = /* @__PURE__ */ new Set();
      this.app.vault.getMarkdownFiles().forEach((file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.tags) {
          cache.tags.forEach((tag) => tags.add(tag.tag));
        }
      });
      return Array.from(tags);
    }
    /**
     * 创建视图切换按钮
     * @param container - 按钮容器元素
     */
    createViewSwitcher(container) {
      const views = [
        { id: "card", icon: "grid", text: "\u5361\u7247\u89C6\u56FE" },
        { id: "list", icon: "list", text: "\u5217\u8868\u89C6\u56FE" },
        { id: "timeline", icon: "clock", text: "\u65F6\u95F4\u8F74\u89C6\u56FE" }
      ];
      views.forEach((view) => {
        const btn = container.createEl("button", {
          cls: `view-switch-btn ${view.id === this.currentView ? "active" : ""}`
        });
        const iconHtml = {
          "grid": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
          "list": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
          "clock": '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
        };
        const iconSpan = btn.createSpan({ cls: "view-switch-icon" });
        iconSpan.innerHTML = iconHtml[view.icon];
        btn.createSpan({ text: view.text, cls: "view-switch-text" });
        btn.addEventListener("click", () => {
          container.querySelectorAll(".view-switch-btn").forEach((b) => b.removeClass("active"));
          btn.addClass("active");
          this.switchView(view.id);
        });
      });
    }
    // 加载所有笔记并创建卡片
    async loadNotes() {
      const files = this.app.vault.getMarkdownFiles();
      this.container.empty();
      const cards = await Promise.all(
        files.map((file) => this.createNoteCard(file))
      );
      cards.forEach((card) => {
        if (card instanceof HTMLElement) {
          card.style.width = `${this.cardSize}px`;
          this.container.appendChild(card);
        }
      });
      this.container.style.gridTemplateColumns = `repeat(auto-fill, ${this.cardSize}px)`;
    }
    /**
     * 创建单个笔记卡片
     * @param file - 笔记文件
     * @returns 卡片HTML元素
     */
    async createNoteCard(file) {
      const card = document.createElement("div");
      card.addClass("note-card");
      card.setAttribute("data-path", file.path);
      const header = card.createDiv("note-card-header");
      const lastModified = header.createDiv("note-date");
      lastModified.setText(new Date(file.stat.mtime).toLocaleDateString());
      const folderPath = header.createDiv("note-folder");
      const folder = file.parent ? file.parent.path === "/" ? "\u6839\u76EE\u5F55" : file.parent.path : "\u6839\u76EE\u5F55";
      folderPath.setText(folder);
      folderPath.setAttribute("title", `\u6253\u5F00\u6587\u4EF6\u5939: ${folder}`);
      folderPath.addClass("clickable");
      folderPath.addEventListener("click", async (e) => {
        console.log("\u70B9\u51FB\u4E86\u6587\u4EF6\u5939", e);
        e.stopPropagation();
        e.preventDefault();
        console.log("\u70B9\u51FB\u4E86\u6587\u4EF6\u5939", e);
        const fileExplorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
        if (fileExplorer) {
          console.log("fileExplorer", fileExplorer);
          this.app.workspace.revealLeaf(fileExplorer);
          const fileExplorerView = fileExplorer.view;
          if (fileExplorerView.expandFolder) {
            await this.revealFolderInExplorer(folder);
            fileExplorer.setEphemeralState({ focus: true });
            folderPath.addClass("folder-clicked");
            setTimeout(() => {
              folderPath.removeClass("folder-clicked");
            }, 200);
          }
        }
      });
      const openButton = header.createDiv("note-open-button");
      openButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
      openButton.setAttribute("title", "\u5728\u65B0\u6807\u7B7E\u9875\u4E2D\u6253\u5F00");
      openButton.style.opacity = "0";
      const cardContent = card.createDiv("note-card-content");
      const title = cardContent.createDiv("note-title");
      let displayTitle = file.basename;
      const timePattern = /^\d{4}[-./]\d{2}[-./]\d{2}/;
      if (timePattern.test(displayTitle)) {
        displayTitle = displayTitle.replace(timePattern, "").trim();
      }
      title.setText(displayTitle);
      try {
        const content = await this.app.vault.read(file);
        const noteContent = cardContent.createDiv("note-content");
        await import_obsidian.MarkdownRenderer.renderMarkdown(
          content,
          noteContent,
          file.path,
          this
        );
        card.addEventListener("mouseenter", async () => {
          openButton.style.opacity = "1";
          title.style.opacity = "0";
          title.style.display = "none";
          noteContent.style.opacity = "1";
          try {
            this.previewContainer.empty();
            await import_obsidian.MarkdownRenderer.renderMarkdown(
              content,
              this.previewContainer,
              file.path,
              this
            );
          } catch (error) {
            console.error("\u9884\u89C8\u52A0\u8F7D\u5931\u8D25:", error);
          }
        });
        card.addEventListener("mouseleave", () => {
          openButton.style.opacity = "0";
          title.style.opacity = "1";
          title.style.display = "block";
          noteContent.style.opacity = "0.3";
        });
        openButton.addEventListener("click", async (e) => {
          e.stopPropagation();
          await this.openInAppropriateLeaf(file);
        });
        card.addEventListener("click", (e) => {
          this.handleCardSelection(file.path, e);
        });
        card.addEventListener("dblclick", async () => {
          await this.openInAppropriateLeaf(file);
        });
        card.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this.showContextMenu(e, this.getSelectedFiles());
        });
      } catch (error) {
        console.error("\u7B14\u8BB0\u52A0\u8F7D\u5931\u8D25:", error);
      }
      card.addEventListener("mouseenter", async () => {
        openButton.style.opacity = "1";
      });
      card.addEventListener("mouseleave", () => {
        openButton.style.opacity = "0";
      });
      return card;
    }
    /**
     * 切换视图模式
     * @param view - 目标视图模式
     */
    switchView(view) {
      this.currentView = view;
      this.container.setAttribute("data-view", view);
      this.container.empty();
      if (view === "timeline") {
        this.createTimelineView();
      } else {
        this.loadNotes();
      }
    }
    /**
     * 根据标签过滤笔记
     * @param tag - 标签名称
     */
    async filterByTag(tag) {
      const files = this.app.vault.getMarkdownFiles();
      this.container.empty();
      const filteredFiles = files.filter((file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        return cache?.tags?.some((t) => t.tag === tag);
      });
      const cards = await Promise.all(
        filteredFiles.map((file) => this.createNoteCard(file))
      );
      cards.forEach((card) => {
        this.container.appendChild(card);
      });
      this.tagContainer.querySelectorAll("button").forEach((btn) => {
        if (btn.textContent === tag) {
          btn.addClass("active-tag");
        } else {
          btn.removeClass("active-tag");
        }
      });
    }
    // 切换预览栏的显示状态
    togglePreview() {
      this.isPreviewCollapsed = !this.isPreviewCollapsed;
      if (this.isPreviewCollapsed) {
        this.previewContainer.addClass("collapsed");
      } else {
        this.previewContainer.removeClass("collapsed");
      }
    }
    // 修改预览栏大小调整方法
    setupResizer() {
      let startX;
      let startWidth;
      const startResize = (e) => {
        e.preventDefault();
        startX = e.pageX;
        startWidth = parseInt(getComputedStyle(this.previewContainer).width, 10);
        document.addEventListener("mousemove", resize);
        document.addEventListener("mouseup", stopResize);
        document.body.style.cursor = "col-resize";
        this.previewResizer.addClass("resizing");
      };
      const resize = (e) => {
        const width = startWidth - (e.pageX - startX);
        if (width >= 50 && width <= 800) {
          this.previewContainer.style.width = `${width}px`;
          this.adjustContentWidth();
          if (this.isPreviewCollapsed) {
            this.isPreviewCollapsed = false;
            this.previewContainer.removeClass("collapsed");
          }
        }
      };
      const stopResize = () => {
        document.removeEventListener("mousemove", resize);
        document.removeEventListener("mouseup", stopResize);
        document.body.style.cursor = "";
        this.previewResizer.removeClass("resizing");
      };
      this.previewResizer.addEventListener("mousedown", startResize);
    }
    // 添加内容区域宽度调整方法
    adjustContentWidth() {
      const mainLayout = this.containerEl.querySelector(".main-layout");
      const previewWidth = this.previewContainer.offsetWidth;
      const contentSection = this.containerEl.querySelector(".content-section");
      if (mainLayout instanceof HTMLElement && contentSection instanceof HTMLElement) {
        const totalWidth = mainLayout.offsetWidth;
        const newContentWidth = totalWidth - previewWidth - 4;
        contentSection.style.width = `${newContentWidth}px`;
        const availableWidth = newContentWidth - 32;
        const columns = Math.floor(availableWidth / this.cardSize);
        const gap = 16;
        const actualCardWidth = (availableWidth - (columns - 1) * gap) / columns;
        this.container.style.gridTemplateColumns = `repeat(${columns}, ${actualCardWidth}px)`;
      }
    }
    // 高亮文件夹
    highlightFolder(folder) {
      this.currentFolder = this.currentFolder === folder ? null : folder;
      this.container.querySelectorAll(".note-card").forEach((card) => {
        const folderElement = card.querySelector(".note-folder");
        const cardFolder = folderElement ? folderElement.textContent : null;
        if (cardFolder) {
          card.toggleClass("folder-highlight", cardFolder === folder);
        }
      });
    }
    async revealFolderInExplorer(folder) {
      const fileExplorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
      if (fileExplorer) {
        const fileExplorerView = fileExplorer.view;
        if (folder === "\u6839\u76EE\u5F55") {
          if (fileExplorerView.expandFolder) {
            await fileExplorerView.expandFolder("/");
          }
          return;
        }
        if (fileExplorerView.expandFolder) {
          const folderParts = folder.split("/");
          let currentPath = "";
          for (const part of folderParts) {
            currentPath += (currentPath ? "/" : "") + part;
            await fileExplorerView.expandFolder(currentPath);
          }
          if (fileExplorerView.setSelection) {
            await fileExplorerView.setSelection(folder);
          }
        }
      }
    }
    // 创建新笔记
    async createNewNote() {
      const date = /* @__PURE__ */ new Date();
      const fileName = ` ${date.toLocaleString().replace(/[/:]/g, "-")}\u672A\u547D\u540D\u7B14\u8BB0`;
      try {
        const file = await this.app.vault.create(
          `${fileName}.md`,
          "# " + fileName + "\n\n"
        );
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.openFile(file);
        this.loadNotes();
      } catch (error) {
        console.error("\u521B\u5EFA\u7B14\u8BB0\u5931\u8D25:", error);
      }
    }
    // 创建时间轴视图
    async createTimelineView() {
      const timelineContainer = this.container.createDiv("timeline-container");
      const files = this.app.vault.getMarkdownFiles();
      const notesByDate = /* @__PURE__ */ new Map();
      files.forEach((file) => {
        const date = new Date(file.stat.mtime).toLocaleDateString();
        if (!notesByDate.has(date)) {
          notesByDate.set(date, []);
        }
        const notes = notesByDate.get(date);
        if (notes) {
          notes.push(file);
        }
      });
      const sortedDates = Array.from(notesByDate.keys()).sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      );
      for (const date of sortedDates) {
        const dateGroup = timelineContainer.createDiv("timeline-date-group");
        const dateNode = dateGroup.createDiv("timeline-date-node");
        dateNode.createDiv("timeline-node-circle");
        dateNode.createDiv("timeline-date-label").setText(date);
        const notesList = dateGroup.createDiv("timeline-notes-list");
        const notes = notesByDate.get(date);
        if (notes) {
          for (const file of notes) {
            const noteItem = notesList.createDiv("timeline-note-item");
            noteItem.createDiv("timeline-note-marker");
            const noteContent = noteItem.createDiv("timeline-note-content");
            noteContent.createDiv("timeline-note-title").setText(file.basename);
            noteItem.addEventListener("click", async () => {
              const leaf = this.app.workspace.getLeaf("tab");
              await leaf.openFile(file);
            });
            noteItem.addEventListener("mouseenter", async () => {
              try {
                this.previewContainer.empty();
                const content = await this.app.vault.read(file);
                await import_obsidian.MarkdownRenderer.renderMarkdown(
                  content,
                  this.previewContainer,
                  file.path,
                  this
                );
              } catch (error) {
                console.error("\u9884\u89C8\u52A0\u8F7D\u5931\u8D25:", error);
              }
            });
          }
        }
      }
    }
    // 刷新视图（用于搜索和过滤）
    async refreshView() {
      const files = this.app.vault.getMarkdownFiles();
      this.container.empty();
      const filteredFiles = files.filter((file) => {
        const matchesSearch = !this.currentSearchTerm || file.basename.toLowerCase().includes(this.currentSearchTerm.toLowerCase());
        let matchesTags = true;
        if (this.selectedTags.size > 0) {
          const cache = this.app.metadataCache.getFileCache(file);
          matchesTags = cache?.tags?.some((t) => this.selectedTags.has(t.tag)) ?? false;
        }
        let matchesDate = true;
        if (this.currentFilter.type === "date") {
          const fileDate = new Date(file.stat.mtime);
          const fileDateStr = fileDate.toISOString().split("T")[0];
          if (this.currentFilter.value?.length === 7) {
            matchesDate = fileDateStr.startsWith(this.currentFilter.value);
          } else {
            matchesDate = fileDateStr === this.currentFilter.value;
          }
        }
        return matchesSearch && matchesTags && matchesDate;
      });
      const cards = await Promise.all(
        filteredFiles.map((file) => this.createNoteCard(file))
      );
      cards.forEach((card) => {
        if (card instanceof HTMLElement) {
          card.style.width = `${this.cardSize}px`;
          this.container.appendChild(card);
        }
      });
      this.container.style.gridTemplateColumns = `repeat(auto-fill, ${this.cardSize}px)`;
    }
    // 添加标签切换方法
    toggleTag(tag, tagBtn) {
      if (this.selectedTags.has(tag)) {
        this.selectedTags.delete(tag);
        tagBtn.removeClass("active");
      } else {
        this.selectedTags.add(tag);
        tagBtn.addClass("active");
      }
      const allBtn = this.tagContainer.querySelector("button");
      if (allBtn) {
        allBtn.removeClass("active");
      }
      this.refreshView();
    }
    // 添加清除标签选择方法
    clearTagSelection() {
      this.selectedTags.clear();
      this.tagContainer.querySelectorAll(".tag-btn").forEach((btn) => {
        btn.removeClass("active");
      });
    }
    // 处理卡片选择
    handleCardSelection(path, event) {
      const card = this.container.querySelector(`[data-path="${path}"]`);
      if (!card) {
        this.clearSelection();
        return;
      }
      if (event.ctrlKey) {
        if (this.selectedNotes.has(path)) {
          this.selectedNotes.delete(path);
          card.removeClass("selected");
        } else {
          this.selectedNotes.add(path);
          card.addClass("selected");
        }
      } else if (event.shiftKey && this.lastSelectedNote) {
        const cards = Array.from(this.container.querySelectorAll(".note-card"));
        const lastIndex = cards.findIndex((c) => c.getAttribute("data-path") === this.lastSelectedNote);
        const currentIndex = cards.findIndex((c) => c.getAttribute("data-path") === path);
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        cards.forEach((c, i) => {
          const cardPath = c.getAttribute("data-path");
          if (i >= start && i <= end && cardPath) {
            this.selectedNotes.add(cardPath);
            c.addClass("selected");
          }
        });
      } else {
        this.clearSelection();
        this.selectedNotes.add(path);
        card.addClass("selected");
      }
      this.lastSelectedNote = path;
    }
    // 清除所有选择
    clearSelection() {
      this.selectedNotes.clear();
      this.container.querySelectorAll(".note-card.selected").forEach((card) => {
        card.removeClass("selected");
      });
    }
    // 获取选中的文件
    getSelectedFiles() {
      return Array.from(this.selectedNotes).map((path) => this.app.vault.getAbstractFileByPath(path)).filter((file) => file instanceof import_obsidian.TFile);
    }
    // 显示右键菜单
    showContextMenu(event, files) {
      const menu = new import_obsidian.Menu();
      if (files.length > 0) {
        menu.addItem((item) => {
          item.setTitle(`\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00`).setIcon("link").onClick(async () => {
            for (const file of files) {
              const leaf = this.app.workspace.getLeaf("tab");
              await leaf.openFile(file);
            }
          });
        });
        menu.addItem((item) => {
          item.setTitle(`\u5728\u4EF6\u7BA1\u7406\u5668\u4E2D\u663E\u793A`).setIcon("folder").onClick(() => {
            const file = files[0];
            this.revealFolderInExplorer(file.parent?.path || "/");
          });
        });
        menu.addItem((item) => {
          item.setTitle(`\u79FB\u52A8 ${files.length} \u4E2A\u6587\u4EF6`).setIcon("move").onClick(() => {
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
          item.setTitle(`\u5220\u9664 ${files.length} \u4E2A\u6587\u4EF6`).setIcon("trash").onClick(async () => {
            const confirm = await new ConfirmModal(
              this.app,
              "\u786E\u8BA4\u5220\u9664",
              `\u662F\u5426\u786E\u5B9A\u8981\u5220\u9664\u9009\u4E2D\u7684 ${files.length} \u4E2A\u6587\u4EF6\uFF1F`
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
    adjustCardSize(delta) {
      const adjustment = delta > 0 ? -10 : 10;
      const newSize = Math.max(
        this.plugin.settings.minCardWidth,
        Math.min(this.plugin.settings.maxCardWidth, this.cardSize + adjustment)
      );
      if (newSize !== this.cardSize) {
        this.cardSize = newSize;
        this.updateCardSize(newSize);
        this.plugin.saveCardWidth(newSize);
      }
    }
    // 添加更新卡片大小的方法
    updateCardSize(width) {
      this.cardSize = width;
      this.container.querySelectorAll(".note-card").forEach((card) => {
        if (card instanceof HTMLElement) {
          card.style.width = `${width}px`;
        }
      });
      this.container.style.gridTemplateColumns = `repeat(auto-fill, ${width}px)`;
    }
    // 创建日历按钮
    createCalendarButton(leftTools) {
      const calendarBtn = leftTools.createEl("button", {
        cls: "calendar-toggle-button"
      });
      calendarBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>\u65E5\u5386</span>
        `;
      calendarBtn.addEventListener("click", () => {
        this.toggleCalendar();
        calendarBtn.toggleClass("active", this.isCalendarVisible);
      });
    }
    // 切换日历的显示状态
    toggleCalendar() {
      this.isCalendarVisible = !this.isCalendarVisible;
      if (this.isCalendarVisible) {
        this.showCalendar();
        this.filterNotesByMonth(this.currentDate);
      } else {
        this.hideCalendar();
        this.clearDateFilter();
      }
    }
    // 添加按月份过滤的方法
    filterNotesByMonth(date) {
      const year = date.getFullYear();
      const month = date.getMonth();
      this.currentFilter = {
        type: "date",
        value: `${year}-${(month + 1).toString().padStart(2, "0")}`
      };
      this.refreshView();
    }
    // 显示日历
    showCalendar() {
      if (!this.calendarContainer) {
        const contentSection = this.containerEl.querySelector(".content-section");
        if (!contentSection) return;
        this.calendarContainer = createDiv("calendar-container");
        contentSection.parentElement?.insertBefore(this.calendarContainer, contentSection);
      }
      this.calendarContainer.empty();
      this.renderCalendar();
      this.calendarContainer.style.display = "block";
      const mainLayout = this.containerEl.querySelector(".main-layout");
      if (mainLayout) {
        mainLayout.addClass("with-calendar");
      }
    }
    // 隐藏日历 
    hideCalendar() {
      if (this.calendarContainer) {
        this.calendarContainer.style.display = "none";
        this.calendarContainer.empty();
        const mainLayout = this.containerEl.querySelector(".main-layout");
        if (mainLayout) {
          mainLayout.removeClass("with-calendar");
        }
      }
    }
    // 渲染日历
    renderCalendar() {
      if (!this.calendarContainer) {
        return;
      }
      this.calendarContainer.empty();
      const year = this.currentDate.getFullYear();
      const month = this.currentDate.getMonth();
      const header = this.calendarContainer.createDiv("calendar-header");
      const prevBtn = header.createEl("button", { cls: "calendar-nav-btn" });
      prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.currentDate = new Date(year, month - 1, 1);
        this.renderCalendar();
        this.filterNotesByMonth(this.currentDate);
      });
      header.createDiv("calendar-title").setText(
        `${year}\u5E74${month + 1}\u6708`
      );
      const nextBtn = header.createEl("button", { cls: "calendar-nav-btn" });
      nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.currentDate = new Date(year, month + 1, 1);
        this.renderCalendar();
        this.filterNotesByMonth(this.currentDate);
      });
      const weekdays = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
      const weekHeader = this.calendarContainer.createDiv("calendar-weekdays");
      weekdays.forEach((day) => {
        weekHeader.createDiv("weekday").setText(day);
      });
      const grid = this.calendarContainer.createDiv("calendar-grid");
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const notesCount = this.getNotesCountByDate(year, month);
      for (let i = 0; i < firstDay; i++) {
        grid.createDiv("calendar-day empty");
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = grid.createDiv("calendar-day");
        const dateStr = `${year}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        dayEl.setText(day.toString());
        dayEl.setAttribute("data-date", dateStr);
        if (this.currentFilter.type === "date" && this.currentFilter.value === dateStr) {
          dayEl.addClass("selected");
        }
        const count = notesCount[dateStr] || 0;
        if (count > 0) {
          dayEl.createDiv("note-count").setText(count.toString());
        }
        dayEl.addEventListener("click", () => {
          this.filterNotesByDate(dateStr);
        });
      }
    }
    // 获取每天的笔记数量
    getNotesCountByDate(year, month) {
      const counts = {};
      const files = this.app.vault.getMarkdownFiles();
      files.forEach((file) => {
        const date = new Date(file.stat.mtime);
        if (date.getFullYear() === year && date.getMonth() === month) {
          const dateStr = date.toISOString().split("T")[0];
          counts[dateStr] = (counts[dateStr] || 0) + 1;
        }
      });
      return counts;
    }
    // 根据日期过滤笔记
    filterNotesByDate(dateStr) {
      if (this.currentFilter.type === "date" && this.currentFilter.value === dateStr) {
        this.clearDateFilter();
        return;
      }
      this.calendarContainer.querySelectorAll(".calendar-day").forEach((day) => {
        day.removeClass("selected");
      });
      this.currentFilter = { type: "date", value: dateStr };
      const selectedDay = this.calendarContainer.querySelector(`.calendar-day[data-date="${dateStr}"]`);
      if (selectedDay) {
        selectedDay.addClass("selected");
      }
      this.refreshView();
    }
    // 添加清除日期过滤的方法
    clearDateFilter() {
      this.currentFilter = { type: "none" };
      if (this.calendarContainer) {
        this.calendarContainer.querySelectorAll(".calendar-day").forEach((day) => {
          day.removeClass("selected");
        });
      }
      this.refreshView();
    }
    // 高亮搜索词
    highlightSearchTerm(content, searchTerm) {
      if (!searchTerm) return content;
      const regex = new RegExp(searchTerm, "gi");
      return content.replace(regex, (match) => `<span class="search-highlight">${match}</span>`);
    }
    // 修改方法名以更好地反映其功能
    async openInAppropriateLeaf(file) {
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      const currentRoot = this.leaf.getRoot();
      const otherLeaf = leaves.find((leaf) => {
        const root = leaf.getRoot();
        return root !== currentRoot;
      });
      if (otherLeaf) {
        await otherLeaf.openFile(file);
        this.app.workspace.setActiveLeaf(otherLeaf);
      } else {
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.openFile(file);
      }
    }
    // 渲染文件夹卡片
    renderFolderCard(folder) {
      const cardEl = createDiv("card folder-card");
      cardEl.addEventListener("click", () => {
        const fileExplorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
        if (fileExplorer) {
          this.app.workspace.revealLeaf(fileExplorer);
          const fileExplorerView = fileExplorer.view;
          if (fileExplorerView && fileExplorerView.revealInFolder) {
            fileExplorerView.revealInFolder(folder);
          }
        }
      });
      return cardEl;
    }
  };
  var ConfirmModal = class extends import_obsidian.Modal {
    constructor(app, title, message) {
      super(app);
      this.result = false;
      this.resolvePromise = () => {
      };
      this.title = title;
      this.message = message;
    }
    async show() {
      return new Promise((resolve) => {
        this.resolvePromise = resolve;
        this.open();
      });
    }
    onOpen() {
      const { contentEl } = this;
      contentEl.createEl("h3", { text: this.title });
      contentEl.createEl("p", { text: this.message });
      const buttonContainer = contentEl.createDiv("button-container");
      const confirmButton = buttonContainer.createEl("button", { text: "\u786E\u8BA4" });
      confirmButton.addEventListener("click", () => {
        this.result = true;
        this.close();
      });
      const cancelButton = buttonContainer.createEl("button", { text: "\u53D6\u6D88" });
      cancelButton.addEventListener("click", () => {
        this.result = false;
        this.close();
      });
    }
    onClose() {
      const { contentEl } = this;
      contentEl.empty();
      this.resolvePromise(this.result);
    }
  };
  var EnhancedFileSelectionModal = class extends import_obsidian.Modal {
    constructor(app, files, recentFolders, onFoldersUpdate) {
      super(app);
      this.selectedFolder = null;
      this.files = files;
      this.recentFolders = recentFolders;
      this.onFoldersUpdate = onFoldersUpdate;
    }
    async onOpen() {
      const { contentEl } = this;
      contentEl.empty();
      contentEl.createEl("h3", {
        text: `\u79FB\u52A8 ${this.files.length} \u4E2A\u6587\u4EF6`
      });
      if (this.recentFolders.length > 0) {
        const recentSection = contentEl.createDiv("recent-folders-section");
        recentSection.createEl("h4", { text: "\u6700\u4F7F\u7528" });
        const recentList = recentSection.createDiv("recent-folders-list");
        this.recentFolders.forEach((folder) => {
          const item = recentList.createDiv("folder-item recent");
          item.setText(folder);
          item.addEventListener("click", () => this.selectFolder(item, folder));
        });
      }
      const folderList = contentEl.createDiv("folder-list");
      const folders = this.getFoldersWithHierarchy();
      this.createFolderTree(folderList, folders);
      const buttonContainer = contentEl.createDiv("modal-button-container");
      const confirmButton = buttonContainer.createEl("button", {
        text: "\u786E\u8BA4\u79FB\u52A8",
        cls: "mod-cta"
      });
      confirmButton.addEventListener("click", () => {
        if (this.selectedFolder) {
          this.moveFiles(this.selectedFolder);
        }
      });
      const cancelButton = buttonContainer.createEl("button", {
        text: "\u53D6\u6D88"
      });
      cancelButton.addEventListener("click", () => this.close());
    }
    getFoldersWithHierarchy() {
      const folders = [];
      const seen = /* @__PURE__ */ new Set();
      this.app.vault.getAllLoadedFiles().forEach((file) => {
        if (file instanceof import_obsidian.TFolder) {
          const parts = file.path.split("/");
          let currentPath = "";
          let level = 0;
          parts.forEach((part) => {
            if (part) {
              currentPath += (currentPath ? "/" : "") + part;
              if (!seen.has(currentPath)) {
                seen.add(currentPath);
                folders.push({
                  path: currentPath,
                  name: part,
                  level
                });
              }
              level++;
            }
          });
        }
      });
      return folders.sort((a, b) => a.path.localeCompare(b.path));
    }
    createFolderTree(container, folders) {
      folders.forEach((folder) => {
        const item = container.createDiv({
          cls: "folder-item"
        });
        item.style.paddingLeft = `${folder.level * 20 + 10}px`;
        const icon = item.createSpan({
          cls: "folder-icon"
        });
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        const name = item.createSpan({
          cls: "folder-name",
          text: folder.name
        });
        item.addEventListener("click", () => this.selectFolder(item, folder.path));
      });
    }
    selectFolder(element, path) {
      this.contentEl.querySelectorAll(".folder-item").forEach((item) => {
        item.removeClass("selected");
      });
      element.addClass("selected");
      this.selectedFolder = path;
    }
    async moveFiles(targetFolder) {
      const confirmModal = new ConfirmModal(
        this.app,
        "\u786E\u8BA4 \u79FB\u52A8",
        `\u662F\u5426\u5C06\u9009\u4E2D\u7684 ${this.files.length} \u4E2A\u6587\u4EF6\u79FB\u52A8\u5230 "${targetFolder}"\uFF1F`
      );
      if (await confirmModal.show()) {
        for (const file of this.files) {
          const newPath = `${targetFolder}/${file.name}`;
          await this.app.fileManager.renameFile(file, newPath);
        }
        this.recentFolders = [targetFolder, ...this.recentFolders.filter((f) => f !== targetFolder)].slice(0, 5);
        this.onFoldersUpdate(this.recentFolders);
        this.close();
      }
    }
  };
})();
