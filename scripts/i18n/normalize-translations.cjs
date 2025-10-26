const fs = require("node:fs");

const PROPER_NOUNS = [
    "TeXlyre",
    "LangLyre",
    "Chelys",
    "WebPerl",
    "RustWASM",
    "Rust",
    "WASM",
    "WebAssembly",
    "iPhone",
    "iPad",
    "YouTube",
    "iCloud",
    "Google Drive",
    "Dropbox",
    "OneDrive",
    "GitHub Copilot",
    "GitHub",
    "GitLab",
    "CodeMirror",
    "CodeBerg",
    "Bitbucket",
    "Jupyter",
    "JupyterLab",
    "Jupyter Notebook",
    "Forgejo",
    "Gitea",
    "LaTeX",
    "BibTeX",
    "Biber",
    "BibLaTeX",
    "BibTidy",
    "XeTeX",
    "LuaTeX",
    "pdfTeX",
    "Typst",
    "TypeScript",
    "JavaScript",
    "Python",
    "WebRTC",
    "HTTP",
    "HTTPS",
    "WebSocket",
    "IndexedDB",
    "OAuth",
    "OAuth2",
    "Two Factor",
    "2FA",
    "SaaS",
    "OpenAI",
    "OpenAPI",
    "SVG",
    "TXT",
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
    "Pdf.js",
    "React",
    "JabRef",
    "Mendeley",
    "Zotero",
    "FilePizza",
    "Tex-Fmt",
    "TeXCount",
    "Texcount",
    "Wordometer",
    "Typstyle",
    "Overleaf",
    "ShareLaTeX",
    "StackOverflow",
    "StackExchange",
    "Visual Studio",
    "Visual Studio Code",
    "VSCode",
    "Vim",
    "Emacs",
    "Sublime Text",
    "Atom",
    "Eclipse",
    "PyCharm",
];

function preserveInterpolation(text) {
    const placeholders = new Map();
    let index = 0;

    let processed = text.replace(/\{[^}]+\}/g, (match) => {
        const placeholder = `__VAR${index}__`;
        placeholders.set(placeholder, match);
        index++;
        return placeholder;
    });

    return { processed, placeholders };
}

function restoreInterpolation(text, placeholders) {
    let result = text;
    for (const [placeholder, original] of placeholders.entries()) {
        result = result.replace(placeholder, original);
    }
    return result;
}

function smartSplitCamelCase(text) {
    const { processed, placeholders } = preserveInterpolation(text);

    const properNounMap = new Map();
    let protectedWord = processed;
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

    let result = protectedWord
        .replace(/([a-z])([A-Z])/g, (match, p1, p2) => `${p1} ${p2}`)
        .replace(/([a-z])(\d)/gi, "$1 $2")
        .replace(/(\d)([a-z])/gi, "$1 $2");

    for (const [placeholder, original] of properNounMap.entries()) {
        result = result.replace(placeholder, original);
    }

    result = restoreInterpolation(result, placeholders);

    return result;
}

function normalizeTranslationKey(key) {
    return smartSplitCamelCase(key)
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
    const inputFile = process.argv[2] || "./translations/locales/en.json";
    const outputFile = process.argv[3];

    normalizeTranslations(inputFile, outputFile);
}

module.exports = { normalizeTranslations, normalizeTranslationKey };