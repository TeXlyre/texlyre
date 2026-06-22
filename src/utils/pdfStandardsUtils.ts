// src/utils/pdfStandardsUtils.ts
export interface PdfStandardOption {
    value: string;
    label: string;
    group: 'version' | 'archival' | 'accessibility';
}

export const PDF_STANDARDS: PdfStandardOption[] = [
    { value: '"1.4"', label: 'PDF 1.4', group: 'version' },
    { value: '"1.5"', label: 'PDF 1.5', group: 'version' },
    { value: '"1.6"', label: 'PDF 1.6', group: 'version' },
    { value: '"1.7"', label: 'PDF 1.7', group: 'version' },
    { value: '"2.0"', label: 'PDF 2.0', group: 'version' },
    { value: '"a-1b"', label: 'PDF/A-1b', group: 'archival' },
    { value: '"a-1a"', label: 'PDF/A-1a', group: 'archival' },
    { value: '"a-2b"', label: 'PDF/A-2b', group: 'archival' },
    { value: '"a-2u"', label: 'PDF/A-2u', group: 'archival' },
    { value: '"a-2a"', label: 'PDF/A-2a', group: 'archival' },
    { value: '"a-3b"', label: 'PDF/A-3b', group: 'archival' },
    { value: '"a-3u"', label: 'PDF/A-3u', group: 'archival' },
    { value: '"a-3a"', label: 'PDF/A-3a', group: 'archival' },
    { value: '"a-4"', label: 'PDF/A-4', group: 'archival' },
    { value: '"a-4f"', label: 'PDF/A-4f', group: 'archival' },
    { value: '"a-4e"', label: 'PDF/A-4e', group: 'archival' },
    { value: '"ua-1"', label: 'PDF/UA-1 \u267F', group: 'accessibility' },
];

const GROUP_LABELS: Record<PdfStandardOption['group'], string> = {
    version: 'PDF Versions',
    archival: 'PDF/A Standards',
    accessibility: 'Accessibility Standards',
};

const VERSION_ORDER: Record<string, number> = {
    '"1.4"': 14,
    '"1.5"': 15,
    '"1.6"': 16,
    '"1.7"': 17,
    '"2.0"': 20,
};

interface VersionWindow {
    min: number;
    max: number;
}

const SUBSTANDARD_WINDOW: Record<string, VersionWindow> = {
    '"a-1b"': { min: 14, max: 14 },
    '"a-1a"': { min: 14, max: 14 },
    '"a-2b"': { min: 14, max: 17 },
    '"a-2u"': { min: 14, max: 17 },
    '"a-2a"': { min: 14, max: 17 },
    '"a-3b"': { min: 14, max: 17 },
    '"a-3u"': { min: 14, max: 17 },
    '"a-3a"': { min: 14, max: 17 },
    '"a-4"': { min: 20, max: 20 },
    '"a-4f"': { min: 20, max: 20 },
    '"a-4e"': { min: 20, max: 20 },
    '"ua-1"': { min: 14, max: 17 },
};

export function getStandardGroups(): Array<{
    group: PdfStandardOption['group'];
    label: string;
    options: PdfStandardOption[];
}> {
    return (Object.keys(GROUP_LABELS) as Array<PdfStandardOption['group']>).map(
        (group) => ({
            group,
            label: GROUP_LABELS[group],
            options: PDF_STANDARDS.filter((option) => option.group === group),
        }),
    );
}

function intersectWindows(values: string[]): VersionWindow | null {
    let min = 14;
    let max = 20;
    for (const value of values) {
        const window = SUBSTANDARD_WINDOW[value];
        if (!window) continue;
        min = Math.max(min, window.min);
        max = Math.min(max, window.max);
    }
    return min <= max ? { min, max } : null;
}

export function isStandardEnabled(
    candidate: string,
    selected: string[],
): boolean {
    if (selected.includes(candidate)) return true;

    const candidateOption = PDF_STANDARDS.find((o) => o.value === candidate);
    if (!candidateOption) return true;

    const selectedOptions = selected
        .map((value) => PDF_STANDARDS.find((o) => o.value === value))
        .filter((o): o is PdfStandardOption => !!o);

    const selectedArchival = selectedOptions
        .filter((o) => o.group === 'archival')
        .map((o) => o.value);
    const selectedAccessibility = selectedOptions
        .filter((o) => o.group === 'accessibility')
        .map((o) => o.value);
    const selectedVersion = selectedOptions.find((o) => o.group === 'version');

    if (candidateOption.group === 'archival') {
        if (selectedArchival.length > 0) return false;
        const window = intersectWindows([candidate, ...selectedAccessibility]);
        if (!window) return false;
        if (selectedVersion) {
            const version = VERSION_ORDER[selectedVersion.value];
            return version >= window.min && version <= window.max;
        }
        return true;
    }

    if (candidateOption.group === 'accessibility') {
        if (selectedAccessibility.length > 0) return false;
        const window = intersectWindows([candidate, ...selectedArchival]);
        if (!window) return false;
        if (selectedVersion) {
            const version = VERSION_ORDER[selectedVersion.value];
            return version >= window.min && version <= window.max;
        }
        return true;
    }

    if (candidateOption.group === 'version') {
        if (selectedOptions.some((o) => o.group === 'version')) return false;
        const window = intersectWindows([
            ...selectedArchival,
            ...selectedAccessibility,
        ]);
        if (!window) return true;
        const version = VERSION_ORDER[candidate];
        return version >= window.min && version <= window.max;
    }

    return true;
}

export function toggleStandard(value: string, selected: string[]): string[] {
    return selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
}

export function serializeStandards(selected: string[]): string {
    return selected.join(', ');
}

export function parseStandards(serialized?: string): string[] {
    if (!serialized) return [];
    return serialized
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}