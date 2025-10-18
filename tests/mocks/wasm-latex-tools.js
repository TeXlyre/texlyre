module.exports = {
    __esModule: true,
    WebPerlRunner: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(() => Promise.resolve()),
        isReady: jest.fn(() => true),
        terminate: jest.fn(),
    })),
    TexCount: jest.fn().mockImplementation(() => ({
        run: jest.fn(() => Promise.resolve({
            words: 0,
            headers: 0,
            floats: 0,
            mathInlines: 0,
            mathDisplays: 0,
        })),
    })),
    TexFmt: jest.fn(),
    Latexpand: jest.fn(),
    LatexDiff: jest.fn(),
    ScriptLoader: jest.fn(),
    FileSystemManager: jest.fn(),
    Logger: jest.fn(),
};