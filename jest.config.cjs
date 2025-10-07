module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    moduleNameMapper: {
        '^@src/(.*)$': '<rootDir>/src/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/tests/mocks/fileMock.js',
        '^nanoid$': '<rootDir>/tests/mocks/nanoid.js',
        '^mime$': '<rootDir>/tests/mocks/mime.js',
        '^codemirror-lang-bib$': '<rootDir>/tests/mocks/codemirror.js',
        '^codemirror-lang-latex$': '<rootDir>/tests/mocks/codemirror.js',
        '^codemirror-lang-typst$': '<rootDir>/tests/mocks/codemirror.js',
    },
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/vite-env.d.ts',
    ],
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 60,
            lines: 60,
            statements: 60,
        },
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.test.json',
            },
        ],
    },
    moduleDirectories: ['node_modules', '<rootDir>'],
    testTimeout: 10000,
    maxWorkers: 1,
};