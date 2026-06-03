import { parseLatexLog } from '@extras/loggers/latex_visualizer/parser';

jest.mock('@/i18n', () => ({
    t: (key: string, params?: Record<string, unknown>) =>
        params
            ? key.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''))
            : key,
}));

describe('LaTeX Log Parser', () => {
    describe('parseLatexLog', () => {
        it('should return empty array for clean log', () => {
            const log = `This is pdfTeX, Version 3.14159265
(./main.tex
LaTeX2e <2020-02-02>
)
Output written on main.pdf (1 page).`;

            expect(parseLatexLog(log)).toHaveLength(0);
        });

        it('should parse a LaTeX error with line number', () => {
            const log = `! LaTeX Error: Something went wrong.
l.42 \\badcommand`;

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('error');
            expect(result[0].message).toBe('Something went wrong.');
            expect(result[0].line).toBe(42);
        });

        it('should parse a generic error starting with !', () => {
            const log = `! Undefined control sequence.
l.10 \\foo`;

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('error');
            expect(result[0].message).toBe('Undefined control sequence.');
            expect(result[0].line).toBe(10);
        });

        it('should parse a runaway argument error', () => {
            const log = `Runaway argument?
{\\bfseries some text
l.55 \\end{document}`;

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('error');
            expect(result[0].message).toBe('Runaway argument');
            expect(result[0].line).toBe(55);
        });

        it('should parse a standard LaTeX warning', () => {
            const log =
                'LaTeX Warning: Reference `fig:1\' on page 2 undefined on input line 30.';

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('warning');
            expect(result[0].line).toBe(30);
        });

        it('should parse a LaTeX Font Warning with a (Font) continuation', () => {
            const log = `LaTeX Font Warning: Font shape \`T1/ptm/m/scit' undefined
(Font)              using \`T1/ptm/m/it' instead on input line 95.`;

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('warning');
            expect(result[0].line).toBe(95);
            expect(result[0].message).toContain('Font shape');
            expect(result[0].message).toContain('instead');
        });

        it('should parse a multi-line package warning joined by prefix', () => {
            const log = `Package hyperref Warning: Token not allowed in a PDF string,
(hyperref)                removing \`token' on input line 12.`;

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('warning');
            expect(result[0].message).toContain('hyperref:');
            expect(result[0].message).not.toContain('(hyperref)');
            expect(result[0].line).toBe(12);
        });

        it('should parse a box warning with a line range', () => {
            const log = 'Overfull \\hbox (10.0pt too wide) in paragraph at lines 5--7';

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('warning');
            expect(result[0].message).toBe('Overfull hbox');
            expect(result[0].line).toBe(5);
        });

        it('should parse a box warning without a line number', () => {
            const log = 'Underfull \\vbox (badness 10000) has occurred';

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('warning');
            expect(result[0].message).toBe('Underfull vbox');
            expect(result[0].line).toBeUndefined();
        });

        it('should detect undefined references', () => {
            const log =
                'LaTeX Warning: There were undefined references.';

            const result = parseLatexLog(log);

            expect(result.some((e) => e.type === 'warning')).toBe(true);
        });

        it('should track the current file from context', () => {
            const log = `(/tex/chapter.sty
! LaTeX Error: Broken here.
l.3 \\oops
)`;

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].file).toBe('chapter.sty');
        });

        it('should fall back to the default file outside any context', () => {
            const log = `! LaTeX Error: No file open.
l.1 \\oops`;

            const result = parseLatexLog(log);

            expect(result[0].file).toBe('main.tex');
        });

        it('should resolve SwiftLaTeX underscore-prefixed file names', () => {
            const log = `(_template.tex
! LaTeX Error: Bad.
l.9 \\x
)`;

            const result = parseLatexLog(log);

            expect(result[0].file).toBe('_template.tex');
        });
    });

    describe('busytex harness handling', () => {
        it('should extract only the compiler transcript from a harness dump', () => {
            const log = `$ pdflatex --interaction=nonstopmode template.tex
EXITCODE: 0

TEXMFLOG:

==
LOG:
This is pdfTeX, Version 3.14
! LaTeX Error: From the real log.
l.20 \\oops
==
STDOUT:
This is pdfTeX, Version 3.14
======`;

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].message).toBe('From the real log.');
            expect(result[0].line).toBe(20);
        });

        it('should deduplicate diagnostics repeated across passes', () => {
            const pass = `$ pdflatex --interaction=nonstopmode template.tex
EXITCODE: 0

LOG:
This is pdfTeX
LaTeX Warning: Reference \`x' undefined on input line 5.
==
======`;

            const result = parseLatexLog(`${pass}\n${pass}`);

            expect(result).toHaveLength(1);
            expect(result[0].line).toBe(5);
        });

        it('should leave a plain SwiftLaTeX log untouched', () => {
            const log = `This is pdfTeX, Version 3.14159265 (SwiftLaTeX PDFTeX 0.3.0)
(_template.tex

LaTeX Font Warning: Font shape \`T1/ptm/m/scit' undefined
(Font)              using \`T1/ptm/m/it' instead on input line 95.

)
Output written on _template.pdf (3 pages).`;

            const result = parseLatexLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].line).toBe(95);
            expect(result[0].file).toBe('_template.tex');
        });
    });
});