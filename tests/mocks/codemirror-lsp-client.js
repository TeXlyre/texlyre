const mockLSPClient = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    plugin: jest.fn(() => []),
    request: jest.fn(() => Promise.resolve(null)),
};

module.exports = {
    __esModule: true,
    LSPClient: jest.fn(() => mockLSPClient),
    languageServerExtensions: jest.fn(() => []),
};