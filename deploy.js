const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// 目标目录
const targetDir = 'C:\\Users\\Wonvy\\Desktop\\小顽\\笔记\\.obsidian\\plugins\\obsidian-card-view';

// 需要复制的文件
const filesToCopy = [
    'main.js',
    'styles.css',
    'manifest.json'
];

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// 复制文件函数
function copyFile(file) {
    const sourcePath = path.join(__dirname, file);
    const targetPath = path.join(targetDir, file);
    
    try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`已复制 ${file} 到 ${targetDir}`);
    } catch (err) {
        console.error(`复制 ${file} 失败:`, err);
    }
}

// 初始复制所有文件
filesToCopy.forEach(copyFile);

// 监听文件变化
const watcher = chokidar.watch(filesToCopy, {
    persistent: true,
    cwd: __dirname
});

watcher
    .on('change', (file) => {
        console.log(`检测到文件变化: ${file}`);
        copyFile(file);
    })
    .on('error', error => console.error(`监听错误: ${error}`));

console.log('开始监听文件变化...');

