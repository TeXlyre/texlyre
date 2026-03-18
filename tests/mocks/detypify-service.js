const mockInferSyms = [
    { char: 'α', names: ['alpha'] },
    { char: 'β', names: ['beta'] },
    { char: '∑', names: ['sum'] },
];

const mockDetypify = {
    infer: jest.fn(() => Promise.resolve(new Float32Array([0.9, 0.5, 0.1]))),
};

module.exports = {
    __esModule: true,
    Detypify: jest.fn().mockImplementation(() => mockDetypify),
    inferSyms: mockInferSyms,
    contribSyms: {},
    ortEnv: {
        wasm: {
            numThreads: 1,
            wasmPaths: '',
        },
    },
    drawStrokes: jest.fn(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 224;
        canvas.height = 224;
        return canvas;
    }),
};