import {
    collectAnnotationTagRanges,
    containsAnnotationMarker,
    decodeAnnotationText,
    encodeAnnotationText,
    formatAnnotationResponses,
    hasAnnotationTags,
    locateAnnotationTags,
    parseAnnotationResponses,
    scanAnnotationTags,
    stripAnnotationTagTokens,
    stripAnnotationTags,
} from '@src/utils/annotationTagUtils';

const commentWrap = (id: string, text: string) =>
    `\`<### comment id: ${id}, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>\`${text}\`</### comment id: ${id} ###>\``;

const reviewWrap = (id: string, original: string, text: string) =>
    `\`<### review id: ${id}, user: tester, time: 1700000000000, original: '${encodeAnnotationText(original)}', responses: [] ###>\`${text}\`</### review id: ${id} ###>\``;

describe('Annotation Tag Utils', () => {
    describe('scanAnnotationTags', () => {
        it('should find a comment and its inner text', () => {
            const [match] = scanAnnotationTags(commentWrap('aaa', 'kept'), 'comment');

            expect(match.id).toBe('aaa');
            expect(match.innerText).toBe('kept');
        });

        it('should find a review and ignore comments', () => {
            const doc = `${commentWrap('aaa', 'kept')} ${reviewWrap('bbb', 'old', 'new')}`;

            expect(scanAnnotationTags(doc, 'review')).toHaveLength(1);
            expect(scanAnnotationTags(doc, 'comment')).toHaveLength(1);
        });

        it('should find nested annotations of the same kind', () => {
            const doc = commentWrap('outer', `x ${commentWrap('inner', 'deep')} y`);

            expect(scanAnnotationTags(doc, 'comment').map((m) => m.id)).toEqual([
                'outer',
                'inner',
            ]);
        });

        it('should skip an open tag without a close tag', () => {
            const doc =
                "`<### review id: orphan, user: tester, time: 1, original: '', responses: [] ###>`stray";

            expect(scanAnnotationTags(doc, 'review')).toHaveLength(0);
        });

        it('should pair a duplicated open id with the nearest close tag', () => {
            const orphan = reviewWrap('aaa', 'gone', '').split('`</###')[0];
            const doc = `${orphan}body ${reviewWrap('aaa', 'gone', '')}tail`;
            const matches = scanAnnotationTags(doc, 'review');

            expect(matches).toHaveLength(1);
            expect(matches[0].openTagStart).toBe(doc.lastIndexOf('`<###'));
        });

        it('should handle tags wrapped across lines by a formatter', () => {
            const doc =
                "`<### review\nid: wrapped, user: tester, time: 1, original: 'b2xk', responses: [] ###>`new`</### review id: wrapped ###>`";
            const [match] = scanAnnotationTags(doc, 'review');

            expect(match.id).toBe('wrapped');
            expect(match.innerText).toBe('new');
        });

        it('should handle tags without surrounding backticks', () => {
            const doc =
                "<### review id: nobt, user: tester, time: 1, original: '', responses: [] ###>new</### review id: nobt ###>";
            const [match] = scanAnnotationTags(doc, 'review');

            expect(match.openTagStart).toBe(0);
            expect(match.innerText).toBe('new');
        });
    });

    describe('locateAnnotationTags', () => {
        it('should return tag boundaries for a known id', () => {
            const doc = `x ${reviewWrap('bbb', 'old', 'new')} y`;
            const tags = locateAnnotationTags(doc, 'review', 'bbb');

            expect(doc.slice(tags!.openTagEnd, tags!.closeTagStart)).toBe('new');
        });

        it('should return null for an unknown id', () => {
            expect(
                locateAnnotationTags(reviewWrap('bbb', 'old', 'new'), 'review', 'zzz'),
            ).toBeNull();
        });
    });

    describe('collectAnnotationTagRanges', () => {
        it('should merge adjacent tag ranges into one', () => {
            const doc = `${commentWrap('aaa', 'kept')}${reviewWrap('bbb', 'old', 'new')}`;

            expect(collectAnnotationTagRanges(doc)).toHaveLength(3);
        });

        it('should list ranges of both kinds in document order', () => {
            const doc = `${commentWrap('aaa', 'kept')} ${reviewWrap('bbb', 'old', 'new')}`;
            const ranges = collectAnnotationTagRanges(doc);

            expect(ranges).toHaveLength(4);
            expect(ranges[0].from).toBe(0);
            expect(ranges.every((range, index) =>
                index === 0 ? true : range.from >= ranges[index - 1].to,
            )).toBe(true);
        });
    });

    describe('stripAnnotationTags', () => {
        it('should keep the review body and drop its tags', () => {
            expect(stripAnnotationTags(`a ${reviewWrap('bbb', 'old', 'new')} b`)).toBe(
                'a new b',
            );
        });

        it('should strip an empty-bodied deletion review', () => {
            expect(stripAnnotationTags(`a ${reviewWrap('bbb', 'gone', '')}b`)).toBe(
                'a b',
            );
        });

        it('should strip comments and reviews together', () => {
            const doc = `${commentWrap('aaa', 'kept')} ${reviewWrap('bbb', 'old', 'new')}`;

            expect(stripAnnotationTags(doc)).toBe('kept new');
        });

        it('should strip a review nested inside a comment', () => {
            const doc = commentWrap('aaa', `x ${reviewWrap('bbb', 'old', 'new')} y`);

            expect(stripAnnotationTags(doc)).toBe('x new y');
        });

        it('should only strip the requested kind', () => {
            const doc = `${commentWrap('aaa', 'kept')}|${reviewWrap('bbb', 'old', 'new')}`;

            expect(stripAnnotationTags(doc, ['review'])).toBe(
                `${commentWrap('aaa', 'kept')}|new`,
            );
        });
    });

    describe('stripAnnotationTagTokens', () => {
        it('should behave like stripAnnotationTags on balanced tags', () => {
            const doc = `${commentWrap('aaa', 'kept')} ${reviewWrap('bbb', 'old', 'new')}`;

            expect(stripAnnotationTagTokens(doc)).toBe(stripAnnotationTags(doc));
        });

        it('should strip an orphan open tag', () => {
            const [orphan] = reviewWrap('aaa', 'gone', '').split('`</###');

            expect(stripAnnotationTagTokens(`before ${orphan}after`)).toBe(
                'before after',
            );
        });

        it('should strip an orphan close tag', () => {
            expect(
                stripAnnotationTagTokens('before `</### comment id: aaa ###>` after'),
            ).toBe('before  after');
        });

        it('should strip an orphan tag wrapped across lines by a formatter', () => {
            const doc =
                "a `<### review\nid: wrapped, user: tester, time: 1, original: 'b2xk', responses: [] ###>`b";

            expect(stripAnnotationTagTokens(doc)).toBe('a b');
        });

        it('should only strip the requested kind', () => {
            const [orphan] = commentWrap('aaa', 'kept').split('`</###');
            const doc = `${orphan}|${reviewWrap('bbb', 'old', 'new')}`;

            expect(stripAnnotationTagTokens(doc, ['review'])).toBe(`${orphan}|new`);
        });

        it('should leave plain text untouched', () => {
            expect(stripAnnotationTagTokens('plain text')).toBe('plain text');
        });
    });

    describe('hasAnnotationTags', () => {
        it('should detect a review in a string', () => {
            expect(hasAnnotationTags(reviewWrap('bbb', 'old', 'new'))).toBe(true);
        });

        it('should detect a review in a buffer', () => {
            const buffer = new TextEncoder().encode(reviewWrap('bbb', 'o', 'n')).buffer;

            expect(hasAnnotationTags(buffer)).toBe(true);
        });

        it('should return false for plain text', () => {
            expect(hasAnnotationTags('just text')).toBe(false);
            expect(
                hasAnnotationTags(new TextEncoder().encode('just text').buffer),
            ).toBe(false);
        });

        it('should not treat lookalike text as an annotation', () => {
            expect(hasAnnotationTags('a <### heading ###> b')).toBe(false);
        });
    });

    describe('containsAnnotationMarker', () => {
        it('should detect an open or close marker of the given kind', () => {
            expect(containsAnnotationMarker('x <### comment id: a', 'comment')).toBe(
                true,
            );
            expect(containsAnnotationMarker('x </### comment id: a', 'comment')).toBe(
                true,
            );
            expect(containsAnnotationMarker('x <### comment id: a', 'review')).toBe(
                false,
            );
        });
    });

    describe('base64 payloads', () => {
        it('should round-trip text with quotes, newlines and tag syntax', () => {
            const text = "it's\n50% ###> \\alpha{β}";

            expect(decodeAnnotationText(encodeAnnotationText(text))).toBe(text);
        });

        it('should round-trip an empty string', () => {
            expect(decodeAnnotationText(encodeAnnotationText(''))).toBe('');
        });

        it('should return an empty string for malformed input', () => {
            expect(decodeAnnotationText('not base64!!')).toBe('');
        });
    });

    describe('responses', () => {
        it('should round-trip responses through the tag format', () => {
            const responses = [
                { id: 'r1', user: 'tester', timestamp: 1700000000000, content: 'ok' },
            ];
            const tag = `<### review id: a, responses: [${formatAnnotationResponses(responses)}] ###>`;

            expect(parseAnnotationResponses(tag)).toEqual(responses);
        });

        it('should return an empty list when there are no responses', () => {
            expect(
                parseAnnotationResponses('<### review id: a, responses: [] ###>'),
            ).toEqual([]);
        });
    });
});
