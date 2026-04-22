const mockRunner = {
    initialize: jest.fn(() => Promise.resolve()),
    isInitialized: jest.fn(() => true),
    terminate: jest.fn(),
    compile: jest.fn(() =>
        Promise.resolve({
            success: true,
            exitCode: 0,
            log: '',
            pdf: new Uint8Array(),
            synctex: undefined,
        })
    ),
    readProjectFiles: jest.fn(() => Promise.resolve([])),
    writeTexliveRemoteMisses: jest.fn(() => Promise.resolve()),
    writeTexliveRemoteFiles: jest.fn(() => Promise.resolve()),
};

module.exports = {
    __esModule: true,
    BusyTexRunner: jest.fn().mockImplementation(() => mockRunner),
    isPackageCached: jest.fn(() => Promise.resolve(false)),
    deletePackageCache: jest.fn(() => Promise.resolve()),
};