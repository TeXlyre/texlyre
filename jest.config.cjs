module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    globals: {
        __BASE_PATH__: '/texlyre',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(wasm-latex-tools)/)',
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@src/(.*)$': '<rootDir>/src/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/tests/mocks/fileMock.js',
        '^nanoid$': '<rootDir>/tests/mocks/nanoid.js',
        '^mime$': '<rootDir>/tests/mocks/mime.js',
        '^codemirror-lang-bib$': '<rootDir>/tests/mocks/codemirror.js',
        '^codemirror-lang-latex$': '<rootDir>/tests/mocks/codemirror.js',
        '^codemirror-lang-typst$': '<rootDir>/tests/mocks/codemirror.js',
        '^pdfjs-dist$': '<rootDir>/tests/mocks/pdfjs.js',
        '^pdfjs-dist/build/pdf.worker.mjs\\?url$': '<rootDir>/tests/mocks/pdfjs.js',
        '^react-pdf$': '<rootDir>/tests/mocks/react-pdf.js',
        '^react-pdf/dist/esm/entry.webpack5$': '<rootDir>/tests/mocks/react-pdf.js',
        '^filepizza-client$': '<rootDir>/tests/mocks/filepizza-client.js',
        '^wasm-latex-tools$': '<rootDir>/tests/mocks/wasm-latex-tools.js',
    },
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/vite-env.d.ts',
    ],
    // NOTE (fabawi): Disabling threshold for now until we have proper coverage
    // coverageThreshold: {
    //     global: {
    //         branches: 60,
    //         functions: 60,
    //         lines: 60,
    //         statements: 60,
    //     },
    // },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.test.json',
                diagnostics: {
                    ignoreCodes: [1343]
                },
                astTransformers: {
                    before: [
                        {
                            path: 'ts-jest-mock-import-meta',
                            options: { metaObjectReplacement: { url: 'https://texlyre.example.com' } }
                        }
                    ]
                }
            },
        ],
    },
    moduleDirectories: ['node_modules', '<rootDir>'],
    testTimeout: 10000,
};

