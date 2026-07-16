const fs = require('fs');
const path = require('path');

const distDir = path.join(process.cwd(), 'dist');
const indexPath = path.join(distDir, 'index.html');
const notFoundPath = path.join(distDir, '404.html');

if (!fs.existsSync(indexPath)) {
  throw new Error('dist/index.html was not found. Run expo export first.');
}

const html = fs
  .readFileSync(indexPath, 'utf8')
  .replaceAll('href="/', 'href="./')
  .replaceAll('src="/', 'src="./');

fs.writeFileSync(indexPath, html);
fs.writeFileSync(notFoundPath, html);
