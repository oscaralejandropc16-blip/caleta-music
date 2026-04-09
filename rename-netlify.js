const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.next') && !file.includes('.git')) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'src'));

let replacedCount = 0;
for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('caleta-music.netlify.app')) {
        const newContent = content.replace(/caleta-music\.netlify\.app/g, 'caleta-music.vercel.app');
        fs.writeFileSync(file, newContent, 'utf8');
        console.log('Updated:', file);
        replacedCount++;
    }
}
console.log(`Replaced in ${replacedCount} files.`);
