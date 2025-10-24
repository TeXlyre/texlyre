const fs = require("node:fs");
const path = require("node:path");

const PROPER_NOUNS = [
    "TeXlyre",
    "GitHub",
    "GitLab",
    "LaTeX",
    "BibTeX",
    "XeTeX",
    "LuaTeX",
    "pdfTeX",
    "Typst",
    "TypeScript",
    "JavaScript",
    "WebRTC",
    "IndexedDB",
    "OAuth",
    "OpenAI",
    "PDF",
    "ZIP",
    "JSON",
    "XML",
    "HTML",
    "CSS",
    "API",
    "URL",
    "URI",
    "UUID",
    "iOS",
    "macOS",
    "Windows",
    "Linux",
    "Ubuntu",
    "MongoDB",
    "PostgreSQL",
    "MySQL",
    "SQLite",
    "Redis",
    "AWS",
    "Azure",
    "Docker",
    "Kubernetes",
    "GraphQL",
    "WebSocket",
    "Node.js",
    "React",
    "Vue.js",
    "Angular",
];

function isProperNoun(word) {
    return PROPER_NOUNS.some(
        noun => noun.toLowerCase() === word.toLowerCase()
    );
}

function isLikelyAcronym(word) {
    // All caps with 2-5 letters (PDF, API, URL, etc.)
    return /^[A-Z]{2,5}$/.test(word);
}

function isKnownCamelCase(word) {
    // Check if it matches known patterns like iPhone, eBay, etc.
    const knownPatterns = [
        /^[a-z][A-Z]/, // iPhone, eBay
        /[a-z][A-Z][a-z]/, // JavaScript, TypeScript
    ];

    return knownPatterns.some(pattern => pattern.test(word));
}

function smartSplitCamelCase(text) {
    // First, protect proper nouns by replacing them with placeholders
    const properNounMap = new Map();
    let protectedWord = text;
    let placeholderIndex = 0;

    for (const noun of PROPER_NOUNS) {
        const regex = new RegExp(noun, 'gi');
        const matches = [...protectedWord.matchAll(regex)];

        for (const match of matches) {
            const placeholder = `__NOUN${placeholderIndex}__`;
            properNounMap.set(placeholder, match[0]);
            protectedWord = protectedWord.replace(match[0], placeholder);
            placeholderIndex++;
        }
    }

    // Now split camelCase, but be smart about it
    let result = protectedWord
        // Add space before uppercase letters that follow lowercase
        .replace(/([a-z])([A-Z])/g, (match, p1, p2) => {
            // Don't split if next letter is also uppercase (acronym)
            return `${p1} ${p2}`;
        })
        // Add space before numbers if not already present
        .replace(/([a-z])(\d)/gi, "$1 $2")
        // Add space after numbers if not already present
        .replace(/(\d)([a-z])/gi, "$1 $2");

    // Restore proper nouns
    for (const [placeholder, original] of properNounMap.entries()) {
        result = result.replace(placeholder, original);
    }

    return result;
}

function normalizeTranslationKey(key) {
    return smartSplitCamelCase(key)
        // Clean up multiple spaces
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeTranslations(inputFile, outputFile = null) {
    try {
        console.log(`Reading translations from ${inputFile}...`);

        const content = fs.readFileSync(inputFile, "utf8");
        const translations = JSON.parse(content);

        const normalized = {};
        let changedCount = 0;

        for (const [key, value] of Object.entries(translations)) {
            const normalizedKey = normalizeTranslationKey(key);
            const normalizedValue = normalizeTranslationKey(value);

            if (normalizedKey !== key || normalizedValue !== value) {
                console.log(`  "${key}": "${value}"`);
                console.log(`    -> "${normalizedKey}": "${normalizedValue}"`);
                changedCount++;
            }

            // Use the normalized key, but keep the translated value if it was manually edited
            normalized[normalizedKey] = normalizedValue;
        }

        const output = outputFile || inputFile;
        fs.writeFileSync(output, JSON.stringify(normalized, null, 2));

        console.log(`\n✅ Normalized ${changedCount} translation entries`);
        console.log(`📝 Total translations: ${Object.keys(normalized).length}`);
        console.log(`💾 Saved to: ${output}`);

        return normalized;
    } catch (error) {
        console.error(`❌ Error normalizing translations:`, error.message);
        throw error;
    }
}

if (require.main === module) {
    const inputFile = process.argv[2] || "./translations/en.json";
    const outputFile = process.argv[3];

    normalizeTranslations(inputFile, outputFile);
}

module.exports = { normalizeTranslations, normalizeTranslationKey };