module.exports = {
    bibtex: jest.fn(() => ({ extension: [] })),
    bibtexCompletionSource: jest.fn(),
    latex: jest.fn(() => ({ extension: [] })),
    latexCompletionSource: jest.fn(),
    typst: jest.fn(() => ({
        extension: [],
        language: {
            parser: {
                parser: {},
                createParse: jest.fn(),
                updateListener: jest.fn(() => []),
            },
        },
    })),
};