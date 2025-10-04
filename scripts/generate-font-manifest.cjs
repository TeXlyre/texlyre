// scripts/generate-font-manifest.cjs
const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, '../public/assets/fonts');
const outputPath = path.join(fontsDir, 'fonts.json');

const fontExtensions = ['.ttf', '.otf'];

const files = fs.readdirSync(fontsDir)
    .filter(file => fontExtensions.some(ext => file.endsWith(ext)))
    .sort();

fs.writeFileSync(outputPath, JSON.stringify(files, null, 2));

console.log(`Generated fonts.json with ${files.length} fonts`);