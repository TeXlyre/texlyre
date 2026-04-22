// Tests that import PdfTeXEngine/XeTeXEngine/DvipdfmxEngine must call
// setupSwiftLaTeXMocks() before instantiating engines.

function makeEngineMock(overrides = {}) {
    return {
        loadEngine: jest.fn(() => Promise.resolve()),
        closeWorker: jest.fn(),
        setTexliveEndpoint: jest.fn(),
        writeMemFSFile: jest.fn(),
        makeMemFSFolder: jest.fn(),
        setEngineMainFile: jest.fn(),
        flushCache: jest.fn(),
        dumpDirectory: jest.fn(() => Promise.resolve({})),
        compileLaTeX: jest.fn(() =>
            Promise.resolve({ status: 0, pdf: new Uint8Array([1, 2, 3]), log: '' })
        ),
        compilePDF: jest.fn(() =>
            Promise.resolve({ status: 0, pdf: new Uint8Array([1, 2, 3]), log: '' })
        ),
        ...overrides,
    };
}

function setupSwiftLaTeXMocks(overrides = {}) {
    const pdftex = makeEngineMock(overrides.pdftex);
    const xetex = makeEngineMock({
        compileLaTeX: jest.fn(() =>
            Promise.resolve({ status: 0, pdf: new Uint8Array([9, 8, 7]), log: '' })
        ),
        ...overrides.xetex,
    });
    const dvipdfmx = makeEngineMock(overrides.dvipdfmx);

    global.PdfTeXEngine = jest.fn(() => pdftex);
    global.XeTeXEngine = jest.fn(() => xetex);
    global.DvipdfmxEngine = jest.fn(() => dvipdfmx);

    return { pdftex, xetex, dvipdfmx };
}

module.exports = { makeEngineMock, setupSwiftLaTeXMocks };