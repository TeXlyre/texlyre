import { LaTeXOutlineParser } from '@src/utils/latexOutlineParser';

describe('LaTeX Outline Parser', () => {
    describe('parse', () => {
        it('should parse basic sections', () => {
            const content = `
\\section{Introduction}
Some text here.

\\section{Methods}
More content.

\\section{Results}
Results here.
      `.trim();

            const sections = LaTeXOutlineParser.parse(content);

            expect(sections).toHaveLength(3);
            expect(sections[0].title).toBe('Introduction');
            expect(sections[0].type).toBe('section');
            expect(sections[1].title).toBe('Methods');
            expect(sections[2].title).toBe('Results');
        });

        it('should parse nested sections', () => {
            const content = `
\\section{Introduction}

\\subsection{Background}

\\subsection{Motivation}

\\section{Methods}
      `.trim();

            const sections = LaTeXOutlineParser.parse(content);

            expect(sections).toHaveLength(2);
            expect(sections[0].title).toBe('Introduction');
            expect(sections[0].children).toHaveLength(2);
            expect(sections[0].children[0].title).toBe('Background');
            expect(sections[0].children[1].title).toBe('Motivation');
            expect(sections[1].title).toBe('Methods');
        });

        it('should handle starred sections', () => {
            const content = `
\\section*{Unnumbered Section}
\\section{Numbered Section}
      `.trim();

            const sections = LaTeXOutlineParser.parse(content);

            expect(sections).toHaveLength(2);
            expect(sections[0].starred).toBe(true);
            expect(sections[1].starred).toBe(false);
        });

        it('should parse chapter hierarchy', () => {
            const content = `
\\chapter{First Chapter}

\\section{Section in Chapter}

\\subsection{Subsection}

\\chapter{Second Chapter}
      `.trim();

            const sections = LaTeXOutlineParser.parse(content);

            expect(sections).toHaveLength(2);
            expect(sections[0].type).toBe('chapter');
            expect(sections[0].children).toHaveLength(1);
            expect(sections[0].children[0].type).toBe('section');
            expect(sections[0].children[0].children).toHaveLength(1);
        });

        it('should handle line numbers', () => {
            const content = `Line 1
\\section{Introduction}
Line 3
Line 4
\\subsection{Background}
      `.trim();

            const sections = LaTeXOutlineParser.parse(content);

            expect(sections[0].line).toBe(2);
            expect(sections[0].children[0].line).toBe(5);
        });

        it('should handle empty content', () => {
            const sections = LaTeXOutlineParser.parse('');
            expect(sections).toHaveLength(0);
        });

        it('should handle content without sections', () => {
            const content = 'Just some text without any sections.';
            const sections = LaTeXOutlineParser.parse(content);
            expect(sections).toHaveLength(0);
        });
    });

    describe('getCurrentSection', () => {
        const content = `
\\section{Introduction}
Content line 2
Content line 3

\\section{Methods}
Content line 6
Content line 7

\\section{Results}
    `.trim();

        const sections = LaTeXOutlineParser.parse(content);

        it('should find section at current line', () => {
            const current = LaTeXOutlineParser.getCurrentSection(sections, 1);
            expect(current?.title).toBe('Introduction');
        });

        it('should find section for content within', () => {
            const current = LaTeXOutlineParser.getCurrentSection(sections, 3);
            expect(current?.title).toBe('Introduction');
        });

        it('should find correct section after multiple sections', () => {
            const current = LaTeXOutlineParser.getCurrentSection(sections, 7);
            expect(current?.title).toBe('Methods');
        });

        it('should return null for line before first section', () => {
            const contentBefore = `
Some preamble
\\section{First}
      `.trim();
            const sectionsWithPreamble = LaTeXOutlineParser.parse(contentBefore);

            const current = LaTeXOutlineParser.getCurrentSection(sectionsWithPreamble, 1);
            expect(current).toBeNull();
        });

        it('should handle nested sections', () => {
            const nestedContent = `
\\section{Parent}
\\subsection{Child}
Content in child
      `.trim();
            const nestedSections = LaTeXOutlineParser.parse(nestedContent);

            const current = LaTeXOutlineParser.getCurrentSection(nestedSections, 3);
            expect(current?.title).toBe('Child');
        });
    });
});