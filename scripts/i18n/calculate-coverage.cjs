// scripts/i18n/calculate-coverage.cjs
const fs = require('node:fs');
const path = require('node:path');

const translationsDir = path.join(__dirname, '../../translations');
const configFile = path.join(translationsDir, 'languages.config.json');

function loadExistingConfig() {
    if (fs.existsSync(configFile)) {
        return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
    return { languages: [] };
}

function calculateCoverage() {
    const englishPath = path.join(translationsDir, 'locales/en.json');

    if (!fs.existsSync(englishPath)) {
        console.error('English translation file not found');
        return;
    }

    const englishData = JSON.parse(fs.readFileSync(englishPath, 'utf8'));
    const totalKeys = Object.keys(englishData).length;

    const existingConfig = loadExistingConfig();
    const languages = [];

    for (const lang of existingConfig.languages) {
        const filePath = path.join(translationsDir, lang.filePath);

        if (!fs.existsSync(filePath)) {
            console.warn(`Warning: ${lang.filePath} not found, skipping ${lang.name}`);
            continue;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const translatedKeys = Object.keys(englishData).filter(key => {
            return data[key] && data[key] !== englishData[key];
        }).length;

        const coverage = lang.code === 'en' ? 100 : Math.round((translatedKeys / totalKeys) * 100);

        languages.push({
            code: lang.code,
            name: lang.name,
            nativeName: lang.nativeName,
            direction: lang.direction,
            coverage,
            totalKeys,
            translatedKeys,
            filePath: lang.filePath
        });
    }

    const config = {
        _meta: {
            lastUpdated: new Date().toISOString(),
            totalKeys
        },
        languages: languages.sort((a, b) => b.coverage - a.coverage)
    };

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log(`✅ Language coverage calculated for ${languages.length} languages`);
    languages.forEach(lang => {
        console.log(`   ${lang.name} (${lang.code}): ${lang.coverage}%`);
    });
}

if (require.main === module) {
    calculateCoverage();
}

module.exports = { calculateCoverage };