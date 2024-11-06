const fs = require('fs');
const path = require('path');

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

// 复制文件
filesToCopy.forEach(file => {
    const sourcePath = path.join(__dirname, file);
    const targetPath = path.join(targetDir, file);
    
    try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`已复制 ${file} 到 ${targetDir}`);
    } catch (err) {
        console.error(`复制 ${file} 失败:`, err);
    }
});

console.log('部署完成！'); 