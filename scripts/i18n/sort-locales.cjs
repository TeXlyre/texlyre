const fs = require('node:fs');
const path = require('node:path');

const translationsDir = path.join(__dirname, '../../translations');
const configFile = path.join(translationsDir, 'languages.config.json');

function sortLocales() {
    if (!fs.existsSync(configFile)) {
        console.error('❌ languages.config.json not found');
        return;
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    let sortedCount = 0;

    for (const lang of config.languages) {
        const filePath = path.join(translationsDir, lang.filePath);

        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️  ${lang.filePath} not found, skipping`);
            continue;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const sortedData = Object.fromEntries(
            Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
        );

        fs.writeFileSync(filePath, JSON.stringify(sortedData, null, 2));
        sortedCount++;
        console.log(`✓ Sorted ${lang.name} (${lang.code})`);
    }

    console.log(`\n✅ Sorted ${sortedCount} locale files`);
}

if (require.main === module) {
    sortLocales();
}

module.exports = { sortLocales };