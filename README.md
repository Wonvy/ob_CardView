# Obsidian 卡片视图插件

一个用于 Obsidian 的插件，提供卡片式笔记视图，支持多种视图模式和标签过滤。

## 功能特性

- 多种视图模式：
  - 卡片视图：以网格形式展示笔记
  - 列表视图：以列表形式展示笔记
  - 时间轴视图：按时间顺序展示笔记，带有时间轴标记
- 笔记搜索：
  - 实时搜索笔记内容
  - 支持标题搜索
- 标签过滤：
  - 显示所有笔记中的标签
  - 点击标签快速过滤笔记
  - 支持多标签组合过滤
- 笔记预览：
  - 鼠标悬停即可预览笔记内容
  - 可调整预览面板宽度
  - 支持预览面板折叠/展开
- 文件夹导航：
  - 显示笔记所在文件夹
  - 点击可在文件浏览器中定位和展开文件夹
- 笔记操作：
  - 新建笔记：直接在视图中创建新笔记
  - 右键菜单：
    - 在新标签页打开笔记
    - 在文件管理器中显示
    - 移动笔记到其他文件夹
    - 删除笔记（支持确认对话框）

## 使用方法

1. 在 Obsidian 中启用插件
2. 点击左侧边栏的卡片图标打开视图
3. 使用顶部工具栏：
   - 点击"新建笔记"创建笔记
   - 切换不同的视图模式（卡片/列表/时间轴）
   - 在搜索框中输入关键词搜索笔记
4. 标签过滤：
   - 点击标签过滤相关笔记
   - 再次点击取消过滤
5. 卡片功能：
   - 左键点击：在新标签页打开笔记
   - 右键点击：显示操作菜单
   - 悬停：在右侧预览笔记内容
   - 点击文件夹路径：在文件浏览器中定位
6. 预览面板：
   - 拖动左边缘调整宽度
   - 点击折叠按钮收起预览
   - 宽度小于 50px 自动折叠

## 更新记录

### [1.0.4] - 2024-01-07
- 添加笔记搜索功能：
  - 实时搜索功能
  - 搜索框样式优化
- 添加右键菜单功能：
  - 新增笔记操作选项
  - 添加确认对话框
  - 支持笔记移动功能
- 优化标签过滤功能：
  - 改进标签显示样式
  - 添加标签高亮效果
- 修复 Menu 类型错误
- 改进代码组织结构

### [1.0.3] - 2024-01-07
- 修复视图切换按钮的图标和文字显示
- 改进预览面板功能
- 添加时间轴视图
- 优化工具栏布局和样式
- 修复类型检查错误

### [1.0.2] - 2024-01-07
- 修复类型检查错误
- 添加新建笔记功能
- 优化文件夹导航体验
- 改进预览面板的调整功能

### [1.0.1] - 2024-01-07
- 修复工具栏显示问题
- 添加视图切换按钮图标
- 优化预览面板样式
- 改进卡片布局和交互

### [1.0.0] - 2024-01-07
- 初始版本发布
- 基本功能实现

## 待办事项
- [ ] 添加笔记排序功能（按标题、创建时间、修改时间）
- [ ] 支持笔记内容搜索
- [ ] 添加自定义卡片样式
- [ ] 支持批量操作（移动、删除等）
- [ ] 添加笔记统计功能
- [ ] 优化时间轴视图的交互体验
- [ ] 添加更多自定义设置选项
- [ ] 支持笔记标签编辑
- [ ] 添加笔记预览方式设置

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 开发说明

### 构建和部署