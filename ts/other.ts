import {
    TFile,
    Notice,
} from 'obsidian';

// 打开文件
export async function openInAppropriateLeaf(app: any, file: TFile, openFile: boolean = true) {
    const fileExplorer = app.workspace.getLeavesOfType('file-explorer')[0];
    if (fileExplorer) {
        app.workspace.revealLeaf(fileExplorer);  // 如果文件浏览已经在，直接活它
        try {
            if (openFile) {
                // 只有在要打开文件时才执行这些操作
                const leaves = app.workspace.getLeavesOfType('markdown');
                const currentRoot = app.leaf?.getRoot();
                const otherLeaf = leaves.find((leaf: any) => {
                    const root = leaf.getRoot();
                    return root !== currentRoot;
                });
                
                let targetLeaf;
                if (otherLeaf) {
                    await otherLeaf.openFile(file);
                    targetLeaf = otherLeaf;
                } else {
                    targetLeaf = app.workspace.getLeaf('tab');
                    await targetLeaf.openFile(file);
                }
                
                app.workspace.setActiveLeaf(targetLeaf);
            }
            
            // 无论是否打开文件，都在文件管理器中定位文件
            const fileExplorer = app.workspace.getLeavesOfType('file-explorer')[0];
            if (fileExplorer && fileExplorer.view) {
                await (fileExplorer.view as any).revealInFolder(file);
            }
        } catch (error) {
            console.error('操作失败:', error);
            new Notice('操作失败');
        }
    }
}


// 获取指定周的日期范围
export function getWeekDates(year: number, week: number): Date[] {
    console.log('获取周日期范围 - 年份:', year, '周数:', week);
    
    // 获取该年第一天
    const firstDayOfYear = new Date(year, 0, 1);
    console.log('年初第一天:', firstDayOfYear.toISOString());
    
    // 调整到第一个周一
    const daysToFirstMonday = (8 - firstDayOfYear.getDay()) % 7;
    const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);
    console.log('第一个周一:', firstMonday.toISOString());
    
    // 计算目标周的周一
    const weekStart = new Date(firstMonday);
    weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
    console.log('目标周的周一:', weekStart.toISOString());
    
    // 生成该周的所有日期
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        dates.push(date);
    }
    
    console.log('生成的日期范围:', dates.map(d => d.toISOString()));
    return dates;
}


