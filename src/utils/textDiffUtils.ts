// src/utils/textDiffUtils.ts
export interface TextChange {
    from: number;
    to: number;
    insert: string;
}

export class TextDiffUtils {
    static computeChanges(original: string, formatted: string): TextChange[] {
        // Early return if strings are identical
        if (original === formatted) {
            return [];
        }

        // Normalize line endings to ensure consistent comparison
        const normalizedOriginal = original.replace(/\r\n/g, '\n');
        const normalizedFormatted = formatted.replace(/\r\n/g, '\n');

        if (normalizedOriginal === normalizedFormatted) {
            return [];
        }

        // Find common prefix
        let prefixLen = 0;
        const minLen = Math.min(normalizedOriginal.length, normalizedFormatted.length);
        while (prefixLen < minLen && normalizedOriginal[prefixLen] === normalizedFormatted[prefixLen]) {
            prefixLen++;
        }

        // If the entire shorter string is a prefix, we need to handle it carefully
        if (prefixLen === minLen) {
            // One string is a prefix of the other
            if (normalizedOriginal.length > normalizedFormatted.length) {
                // Original is longer - delete the extra part
                return [{
                    from: prefixLen,
                    to: normalizedOriginal.length,
                    insert: ''
                }];
            } else {
                // Formatted is longer - insert the extra part
                return [{
                    from: prefixLen,
                    to: prefixLen,
                    insert: normalizedFormatted.substring(prefixLen)
                }];
            }
        }

        // Find common suffix (but only in the parts after the prefix)
        let suffixLen = 0;
        const maxSuffixLen = minLen - prefixLen;
        while (
            suffixLen < maxSuffixLen &&
            normalizedOriginal[normalizedOriginal.length - 1 - suffixLen] === normalizedFormatted[normalizedFormatted.length - 1 - suffixLen]
        ) {
            suffixLen++;
        }

        // Calculate the change region
        const from = prefixLen;
        const to = normalizedOriginal.length - suffixLen;
        const insert = normalizedFormatted.substring(prefixLen, normalizedFormatted.length - suffixLen);

        // Sanity check: make sure we're not creating an invalid change
        if (from > to || from < 0 || to > normalizedOriginal.length) {
            console.error('[TextDiffUtils] Invalid change detected:', { from, to, originalLength: normalizedOriginal.length });
            return [];
        }

        // If the change would result in the same content, don't apply it
        const resultAfterChange = normalizedOriginal.substring(0, from) + insert + normalizedOriginal.substring(to);
        if (resultAfterChange !== normalizedFormatted) {
            console.error('[TextDiffUtils] Change validation failed - would not produce expected result');
            console.error('Expected:', normalizedFormatted.substring(Math.max(0, from - 20), Math.min(normalizedFormatted.length, from + insert.length + 20)));
            console.error('Would get:', resultAfterChange.substring(Math.max(0, from - 20), Math.min(resultAfterChange.length, from + insert.length + 20)));
            return [];
        }

        return [{
            from,
            to,
            insert
        }];
    }
}