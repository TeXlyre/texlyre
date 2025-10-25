const fs = require('node:fs');
const path = require('node:path');

const translationsDir = path.join(__dirname, '../../translations');
const outputFile = path.join(translationsDir, 'languages.config.json');

const languageMetadata = {
    en: { name: 'English', nativeName: 'English', direction: 'ltr' },
    ar: { name: 'Arabic', nativeName: 'العربية', direction: 'rtl' }
};

function calculateCoverage() {
    const englishPath = path.join(translationsDir, 'en.json');

    if (!fs.existsSync(englishPath)) {
        console.error('English translation file not found');
        return;
    }

    const englishData = JSON.parse(fs.readFileSync(englishPath, 'utf8'));
    const totalKeys = Object.keys(englishData).length;

    const languages = [];

    for (const [code, metadata] of Object.entries(languageMetadata)) {
        const filePath = path.join(translationsDir, `${code}.json`);

        if (!fs.existsSync(filePath)) {
            continue;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const translatedKeys = Object.keys(data).filter(
            key => data[key] && data[key].trim() !== ''
        ).length;

        const coverage = code === 'en' ? 100 : Math.round((translatedKeys / totalKeys) * 100);

        languages.push({
            code,
            name: metadata.name,
            nativeName: metadata.nativeName,
            direction: metadata.direction,
            coverage,
            totalKeys,
            translatedKeys,
            filePath: `${code}.json`
        });
    }

    const config = {
        _meta: {
            lastUpdated: new Date().toISOString(),
            totalKeys
        },
        languages: languages.sort((a, b) => b.coverage - a.coverage)
    };

    fs.writeFileSync(outputFile, JSON.stringify(config, null, 2));
    console.log(`✅ Language coverage calculated for ${languages.length} languages`);
    languages.forEach(lang => {
        console.log(`   ${lang.name} (${lang.code}): ${lang.coverage}%`);
    });
}

if (require.main === module) {
    calculateCoverage();
}

module.exports = { calculateCoverage };