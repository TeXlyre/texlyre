const PLURAL_RULES = {
    en: (n) => n === 1 ? 'one' : 'other',
    ar: (n) => {
        if (n === 0) return 'zero';
        if (n === 1) return 'one';
        if (n === 2) return 'two';
        if (n % 100 >= 3 && n % 100 <= 10) return 'few';
        if (n % 100 >= 11 && n % 100 <= 99) return 'many';
        return 'other';
    },
    ru: (n) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'one';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
        return 'many';
    },
    pl: (n) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (n === 1) return 'one';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
        return 'many';
    },
};

function getPluralForm(language, count) {
    const rule = PLURAL_RULES[language] || PLURAL_RULES.en;
    return rule(count);
}

function detectPluralPattern(text) {
    const patterns = [
        /\{count\}\s*(?:item|file|document|page|project|match)s?/i,
        /(?:item|file|document|page|project|match)s?\s*\{count\}/i,
    ];

    return patterns.some(pattern => pattern.test(text));
}

module.exports = { getPluralForm, detectPluralPattern };