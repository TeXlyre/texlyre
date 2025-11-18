const fs = require('node:fs');
const path = require('node:path');

const translationsDir = path.join(__dirname, '../../translations');
const enPath = path.join(translationsDir, 'locales/en.json');
const baseEnPath = path.join(translationsDir, 'locales/base-en.json');

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function hasPluralSuffix(key) {
    return PLURAL_SUFFIXES.some(suffix => key.endsWith(suffix));
}

function getBaseKey(key) {
    for (const suffix of PLURAL_SUFFIXES) {
        if (key.endsWith(suffix)) {
            return key.slice(0, -suffix.length);
        }
    }
    return key;
}

function generateBasePlurals() {
    if (!fs.existsSync(enPath)) {
        console.error('❌ en.json not found');
        return;
    }

    const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const baseEnData = { ...enData };
    const pluralBaseKeys = new Set();

    for (const key of Object.keys(enData)) {
        if (hasPluralSuffix(key)) {
            pluralBaseKeys.add(getBaseKey(key));
        }
    }

    let addedCount = 0;

    for (const baseKey of pluralBaseKeys) {
        const hasNoSuffix = baseKey in enData;
        const hasZero = `${baseKey}_zero` in enData;
        const hasOne = `${baseKey}_one` in enData;
        const hasTwo = `${baseKey}_two` in enData;
        const hasFew = `${baseKey}_few` in enData;
        const hasMany = `${baseKey}_many` in enData;
        const hasOther = `${baseKey}_other` in enData;

        const referenceValue = enData[`${baseKey}_other`] || enData[`${baseKey}_one`] || enData[baseKey] || baseKey;

        if (!hasNoSuffix) {
            baseEnData[baseKey] = referenceValue;
            addedCount++;
        }
        if (!hasZero) {
            baseEnData[`${baseKey}_zero`] = referenceValue;
            addedCount++;
        }
        if (!hasOne) {
            baseEnData[`${baseKey}_one`] = referenceValue;
            addedCount++;
        }
        if (!hasTwo) {
            baseEnData[`${baseKey}_two`] = referenceValue;
            addedCount++;
        }
        if (!hasFew) {
            baseEnData[`${baseKey}_few`] = referenceValue;
            addedCount++;
        }
        if (!hasMany) {
            baseEnData[`${baseKey}_many`] = referenceValue;
            addedCount++;
        }
        if (!hasOther) {
            baseEnData[`${baseKey}_other`] = referenceValue;
            addedCount++;
        }
    }

    const sortedBaseEnData = Object.fromEntries(
        Object.entries(baseEnData).sort(([a], [b]) => a.localeCompare(b))
    );

    fs.writeFileSync(baseEnPath, JSON.stringify(sortedBaseEnData, null, 2));

    console.log(`✅ Generated base-en.json`);
    console.log(`📊 Plural base keys found: ${pluralBaseKeys.size}`);
    console.log(`🆕 Missing keys added: ${addedCount}`);
    console.log(`💾 Output: ${baseEnPath}`);
}

if (require.main === module) {
    generateBasePlurals();
}

module.exports = { generateBasePlurals };