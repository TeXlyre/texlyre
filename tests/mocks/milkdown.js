const noop = new Proxy(
    jest.fn(() => noop),
    {
        get: (target, prop) => {
            if (prop === '__esModule') return true;
            if (prop in target) return target[prop];
            return noop;
        },
    },
);

module.exports = noop;