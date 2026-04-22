import { TypstOutlineParser } from '@src/utils/typstOutlineParser';

describe('Typst Outline Parser', () => {
    describe('parse', () => {
        it('should parse basic headings', () => {
            const content = `
= Introduction
Some text here.

= Methods
More content.

= Results
Results here.
      `.trim();

            const sections = TypstOutlineParser.parse(content);

            expect(sections).toHaveLength(3);
            expect(sections[0].title).toBe('Introduction');
            expect(sections[0].type).toBe('heading1');
            expect(sections[1].title).toBe('Methods');
            expect(sections[2].title).toBe('Results');
        });

        it('should parse nested headings', () => {
            const content = `
= Introduction

== Background

== Motivation

= Methods
      `.trim();

            const sections = TypstOutlineParser.parse(content);

            expect(sections).toHaveLength(2);
            expect(sections[0].title).toBe('Introduction');
            expect(sections[0].children).toHaveLength(2);
            expect(sections[0].children[0].title).toBe('Background');
            expect(sections[0].children[0].type).toBe('heading2');
            expect(sections[0].children[1].title).toBe('Motivation');
        });

        it('should handle multiple heading levels', () => {
            const content = `
= Level 1
== Level 2
=== Level 3
==== Level 4
===== Level 5
      `.trim();

            const sections = TypstOutlineParser.parse(content);

            expect(sections).toHaveLength(1);
            expect(sections[0].type).toBe('heading1');
            expect(sections[0].children[0].type).toBe('heading2');
            expect(sections[0].children[0].children[0].type).toBe('heading3');
        });

        it('should handle line numbers', () => {
            const content = `Line 1
= Introduction
Line 3
Line 4
== Background
      `.trim();

            const sections = TypstOutlineParser.parse(content);

            expect(sections[0].line).toBe(2);
            expect(sections[0].children[0].line).toBe(5);
        });

        it('should handle empty content', () => {
            const sections = TypstOutlineParser.parse('');
            expect(sections).toHaveLength(0);
        });
    });

    describe('getCurrentSection', () => {
        const content = `
= Introduction
Content line 2
Content line 3

= Methods
Content line 6
Content line 7

= Results
    `.trim();

        const sections = TypstOutlineParser.parse(content);

        it('should find section at current line', () => {
            const current = TypstOutlineParser.getCurrentSection(sections, 1);
            expect(current?.title).toBe('Introduction');
        });

        it('should find section for content within', () => {
            const current = TypstOutlineParser.getCurrentSection(sections, 3);
            expect(current?.title).toBe('Introduction');
        });

        it('should handle nested sections', () => {
            const nestedContent = `
= Parent
== Child
Content in child
      `.trim();
            const nestedSections = TypstOutlineParser.parse(nestedContent);

            const current = TypstOutlineParser.getCurrentSection(nestedSections, 3);
            expect(current?.title).toBe('Child');
        });
    });
});