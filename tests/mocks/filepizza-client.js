module.exports = {
    __esModule: true,
    FilePizzaUploader: jest.fn().mockImplementation(() => ({
        upload: jest.fn(),
        cancel: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
    })),
    FilePizzaDownloader: jest.fn().mockImplementation(() => ({
        download: jest.fn(),
        cancel: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
    })),
};