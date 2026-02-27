module.exports = {
    __esModule: true,
    GlobalWorkerOptions: {
        workerSrc: '',
    },
    getDocument: jest.fn(() => ({
        promise: Promise.resolve({
            numPages: 1,
            getPage: jest.fn(() => Promise.resolve({
                getViewport: jest.fn(() => ({ width: 100, height: 100 })),
                render: jest.fn(() => ({ promise: Promise.resolve() })),
            })),
        }),
    })),
    version: '5.4.296',
};