module.exports = {
    __esModule: true,
    renderToString: jest.fn((tex) => `<span>${tex}</span>`),
    render: jest.fn(),
};