import {
    TFile,
} from 'obsidian';


// 模块-统计信息
export async function renderStats(app: any, container: HTMLElement) {
    console.log('Rendering stats module...');
    const statsContainer = container.createDiv('stats-container');
    
    // 添加创建统计卡片的辅助方法
    const createStatCard  = (container: HTMLElement, label: string, value: number)=> {
        const card = container.createDiv('stat-card');
        card.createDiv('stat-label').setText(label);
        card.createDiv('stat-value').setText(value.toString());
    }


    const files =  app.vault.getMarkdownFiles();
    const totalNotes = files.length;
    
    // 计算总字数
    let totalWords = 0;
    for (const file of files) {
        const content = await  app.vault.read(file);
        totalWords += content.split(/\s+/).length;
    }
    
    // 获取所有标签
    const allTags = new Set<string>();
    files.forEach((file: TFile) => {
        const cache =  app.metadataCache.getFileCache(file);
        if (cache?.tags) {
            cache.tags.forEach((tag: {tag: string}) => allTags.add(tag.tag));
        }
    });
    
    // 创建统计卡片
    createStatCard(statsContainer, '总笔记数', totalNotes);
    createStatCard(statsContainer, '总字数', totalWords);
    createStatCard(statsContainer, '使用标签数', allTags.size);
}

