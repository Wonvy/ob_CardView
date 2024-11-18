import {
    TFile,
    Notice,
} from 'obsidian';

interface FolderItem {
    path: string;
    name: string;
    level: number;
}



// 打开文件
export async function openInAppropriateLeaf(app: any, file: TFile, openFile: boolean = true) {
    const fileExplorer = app.workspace.getLeavesOfType('file-explorer')[0];
    if (fileExplorer) {
        // app.workspace.revealLeaf(fileExplorer);  // 如果文件浏览已经在，直接活它
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


// 创建文件夹树
export function createFolderTree(container: HTMLElement, folders: FolderItem[], selectFolder: (element: HTMLElement, path: string) => void) {
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

        item.addEventListener('click', () => selectFolder(item, folder.path));
    });
}


// 获取周结束时间
export function getEndOfWeek(): Date {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() + (day === 0 ? 0 : 7 - day); // 调整周日的情况
    const sunday = new Date(date.setDate(diff));
    sunday.setHours(23, 59, 59, 999);
    return sunday;
}


// 获取周开始时间
export function  getStartOfWeek(): Date {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 调整周日的情况
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
}
