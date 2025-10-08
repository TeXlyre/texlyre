import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { configure } from '@testing-library/react';

configure({
    asyncUtilTimeout: 3000,
    reactStrictMode: true,
});

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

global.structuredClone = (obj: any) => {
    return JSON.parse(JSON.stringify(obj));
};

const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
const FDBDatabase = require('fake-indexeddb/lib/FDBDatabase');
const FDBObjectStore = require('fake-indexeddb/lib/FDBObjectStore');
const FDBIndex = require('fake-indexeddb/lib/FDBIndex');
const FDBCursor = require('fake-indexeddb/lib/FDBCursor');
const FDBCursorWithValue = require('fake-indexeddb/lib/FDBCursorWithValue');
const FDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
const FDBRequest = require('fake-indexeddb/lib/FDBRequest');
const FDBOpenDBRequest = require('fake-indexeddb/lib/FDBOpenDBRequest');
const FDBTransaction = require('fake-indexeddb/lib/FDBTransaction');

global.indexedDB = new FDBFactory();
global.IDBDatabase = FDBDatabase;
global.IDBObjectStore = FDBObjectStore;
global.IDBIndex = FDBIndex;
global.IDBCursor = FDBCursor;
global.IDBCursorWithValue = FDBCursorWithValue;
global.IDBKeyRange = FDBKeyRange;
global.IDBRequest = FDBRequest;
global.IDBOpenDBRequest = FDBOpenDBRequest;
global.IDBTransaction = FDBTransaction;

jest.mock('src/plugins/renderers/pdf/PdfRenderer', () => {
    const React = require('react');
    return {
        __esModule: true,
        default: () => React.createElement('div', { 'data-testid': 'pdf-renderer' }, 'PDF Renderer Mock'),
    };
});

jest.mock('src/plugins/viewers/pdf/PdfViewer', () => {
    const React = require('react');
    return {
        __esModule: true,
        default: () => React.createElement('div', { 'data-testid': 'pdf-viewer' }, 'PDF Viewer Mock'),
    };
});

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