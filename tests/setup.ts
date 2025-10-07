import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { configure } from '@testing-library/react';

configure({
    asyncUtilTimeout: 3000,
    reactStrictMode: true,
});

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
global.indexedDB = new FDBFactory();

class MockBroadcastChannel {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor(name: string) {
        this.name = name;
    }

    postMessage = jest.fn();
    addEventListener = jest.fn();
    removeEventListener = jest.fn();
    close = jest.fn();
    dispatchEvent = jest.fn();
}

global.BroadcastChannel = MockBroadcastChannel as any;

global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();

delete (window as any).location;
window.location = {
    hash: '',
    href: 'http://localhost/',
    origin: 'http://localhost',
    pathname: '/',
    reload: jest.fn(),
} as any;

Object.defineProperty(global, 'crypto', {
    value: {
        randomUUID: () => '00000000-0000-0000-0000-000000000000',
        subtle: {
            digest: jest.fn(),
        },
        getRandomValues: (arr: any) => arr,
    },
});

const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
    console.error = (...args: any[]) => {
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Warning: An update to') ||
                args[0].includes('Warning: ReactDOM.render') ||
                args[0].includes('Not implemented: HTMLFormElement.prototype.submit') ||
                args[0].includes('act(...)'))
        ) {
            return;
        }
        originalError.call(console, ...args);
    };

    console.warn = (...args: any[]) => {
        if (
            typeof args[0] === 'string' &&
            args[0].includes('ReactDOMTestUtils.act')
        ) {
            return;
        }
        originalWarn.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
    console.warn = originalWarn;
});