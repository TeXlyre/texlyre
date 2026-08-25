const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_SUFFIX_RE = new RegExp(`_(${PLURAL_CATEGORIES.join('|')})$`);

function getPluralCategories(language) {
	if (!language) {
		throw new Error(
			'A language/locale is required (for example: en, de, ar, it, zh).',
		);
	}

	const [supported] = Intl.PluralRules.supportedLocalesOf([language]);
	if (!supported) {
		throw new Error(
			`Plural rules are not available for locale "${language}" in this Node.js runtime.`,
		);
	}

	return new Intl.PluralRules(language, { type: 'cardinal' }).resolvedOptions()
		.pluralCategories;
}

function splitPluralKey(key) {
	const match = key.match(PLURAL_SUFFIX_RE);
	if (!match) return null;

	return {
		baseKey: key.slice(0, -match[0].length),
		category: match[1],
	};
}

function hasCountPlaceholder(key) {
	return key.includes('{count}') || key.includes('{{count}}');
}

function collectPluralCandidates(translations, additionalBaseKeys = []) {
	const candidates = new Set(additionalBaseKeys);

	for (const key of Object.keys(translations)) {
		const plural = splitPluralKey(key);
		if (plural) {
			candidates.add(plural.baseKey);
			continue;
		}

		if (hasCountPlaceholder(key)) {
			candidates.add(key);
		}
	}

	return [...candidates].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function findMissingPluralizations(
	translations,
	language,
	additionalBaseKeys = [],
) {
	const categories = getPluralCategories(language);
	const candidates = collectPluralCandidates(translations, additionalBaseKeys);
	const missing = [];

	for (const baseKey of candidates) {
		const missingCategories = categories.filter(
			(category) => !Object.hasOwn(translations, `${baseKey}_${category}`),
		);

		if (missingCategories.length > 0) {
			missing.push({ baseKey, missingCategories });
		}
	}

	return { language, categories, candidates, missing };
}

function pickSeedValue(translations, baseKey, categories) {
	if (Object.hasOwn(translations, baseKey)) {
		return translations[baseKey];
	}

	if (Object.hasOwn(translations, `${baseKey}_other`)) {
		return translations[`${baseKey}_other`];
	}

	for (const category of categories) {
		const key = `${baseKey}_${category}`;
		if (Object.hasOwn(translations, key)) {
			return translations[key];
		}
	}

	return '';
}

function generateMissingPluralizations(
	translations,
	language,
	additionalBaseKeys = [],
) {
	const audit = findMissingPluralizations(
		translations,
		language,
		additionalBaseKeys,
	);
	const generated = {};

	for (const { baseKey, missingCategories } of audit.missing) {
		const seedValue = pickSeedValue(translations, baseKey, audit.categories);
		for (const category of missingCategories) {
			generated[`${baseKey}_${category}`] = seedValue;
		}
	}

	return { ...audit, generated };
}

module.exports = {
	PLURAL_CATEGORIES,
	PLURAL_SUFFIX_RE,
	getPluralCategories,
	splitPluralKey,
	hasCountPlaceholder,
	collectPluralCandidates,
	findMissingPluralizations,
	generateMissingPluralizations,
};
