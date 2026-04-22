function makeMockRunner() {
    let initialized = false;
    return {
        initialize: jest.fn(() => { initialized = true; return Promise.resolve(); }),
        isInitialized: jest.fn(() => initialized),
        terminate: jest.fn(() => { initialized = false; }),
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
}

module.exports = {
    __esModule: true,
    BusyTexRunner: jest.fn().mockImplementation(() => makeMockRunner()),
    isPackageCached: jest.fn(() => Promise.resolve(false)),
    deletePackageCache: jest.fn(() => Promise.resolve()),
};