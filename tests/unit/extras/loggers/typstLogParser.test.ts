import { parseTypstLog } from '@extras/loggers/typst_visualizer/parser';

describe('Typst Log Parser', () => {
    describe('parseTypstLog', () => {
        it('should return empty array for clean log', () => {
            expect(parseTypstLog('compiled successfully')).toHaveLength(0);
        });

        it('should parse an error with a message', () => {
            const log = 'error: unknown variable: foo';

            const result = parseTypstLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('error');
            expect(result[0].message).toBe('unknown variable: foo');
        });

        it('should parse a warning with a message', () => {
            const log = 'warning: this is deprecated';

            const result = parseTypstLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('warning');
            expect(result[0].message).toBe('this is deprecated');
        });

        it('should parse an info diagnostic', () => {
            const log = 'info: something noteworthy';

            const result = parseTypstLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('info');
        });

        it('should parse a bracketed location into file and line', () => {
            const log = 'error[main.typ:9]: type mismatch';

            const result = parseTypstLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].file).toBe('main.typ');
            expect(result[0].line).toBe(10);
        });

        it('should parse a bracketed location with file but no line', () => {
            const log = 'error[main.typ]: bad thing';

            const result = parseTypstLog(log);

            expect(result[0].file).toBe('main.typ');
            expect(result[0].line).toBeUndefined();
        });

        it('should collect hint lines into hints', () => {
            const log = `error: unexpected token
hint: try removing the comma
hint: or escape it`;

            const result = parseTypstLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].hints).toEqual([
                'try removing the comma',
                'or escape it',
            ]);
        });

        it('should append non-hint follow-up lines to the full message', () => {
            const log = `error: something failed
because of a reason`;

            const result = parseTypstLog(log);

            expect(result[0].fullMessage).toBe(
                'something failed because of a reason',
            );
        });

        it('should stop collecting at the next diagnostic header', () => {
            const log = `error: first problem
warning: second problem`;

            const result = parseTypstLog(log);

            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('error');
            expect(result[0].fullMessage).toBe('first problem');
            expect(result[1].type).toBe('warning');
        });

        it('should parse multiple diagnostics in one log', () => {
            const log = `error: alpha
warning: beta
info: gamma`;

            const result = parseTypstLog(log);

            expect(result).toHaveLength(3);
            expect(result.map((d) => d.type)).toEqual([
                'error',
                'warning',
                'info',
            ]);
        });

        it('should ignore blank and unrelated lines', () => {
            const log = `
compiling document

error: real error

done`;

            const result = parseTypstLog(log);

            expect(result).toHaveLength(1);
            expect(result[0].message).toBe('real error');
        });
    });
});