import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { registerEditorClipboard } from '@src/hooks/editor/editorClipboard';

const openTag = (id: string) =>
    `\`<### comment id: ${id}, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>\``;
const closeTag = (id: string) => `\`</### comment id: ${id} ###>\``;
const wrap = (id: string, text: string) =>
    `${openTag(id)}${text}${closeTag(id)}`;

class FakeClipboardData {
    private store = new Map<string, string>();

    getData(type: string) {
        return this.store.get(type) ?? '';
    }

    setData(type: string, value: string) {
        this.store.set(type, value);
    }
}

let host: HTMLDivElement;
let view: EditorView;
let cleanup: (() => void) | null = null;

const setup = (doc: string) => {
    host = document.createElement('div');
    document.body.appendChild(host);

    view = new EditorView({ state: EditorState.create({ doc }), parent: host });
    cleanup = registerEditorClipboard(host, { current: view } as never);
};

const fireClipboard = (type: 'copy' | 'cut', copied?: string) => {
    const data = new FakeClipboardData();
    if (copied !== undefined) data.setData('text/plain', copied);

    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    view.contentDOM.dispatchEvent(event);

    return { data, event };
};

afterEach(() => {
    cleanup?.();
    cleanup = null;
    view?.destroy();
    host?.remove();
});

describe('registerEditorClipboard', () => {
    it('should strip comments already placed on the clipboard', () => {
        const doc = `before ${wrap('aaa', 'kept')} after`;
        setup(doc);

        const { data } = fireClipboard('copy', doc);

        expect(data.getData('text/plain')).toBe('before kept after');
    });

    it('should strip comments on cut as well', () => {
        const doc = `before ${wrap('aaa', 'kept')} after`;
        setup(doc);

        const { data } = fireClipboard('cut', doc);

        expect(data.getData('text/plain')).toBe('before kept after');
    });

    it('should strip every comment of a select-all copy', () => {
        const doc = `${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')}`;
        setup(doc);

        const { data } = fireClipboard('copy', doc);

        expect(data.getData('text/plain')).toBe('one mid two');
    });

    it('should keep comment-free clipboard text untouched', () => {
        setup('plain text');

        const { data } = fireClipboard('copy', 'plain text');

        expect(data.getData('text/plain')).toBe('plain text');
    });

    it('should fall back to the selection when the clipboard is empty', () => {
        const doc = `before ${wrap('aaa', 'kept')} after`;
        setup(doc);
        view.dispatch({ selection: { anchor: 0, head: doc.length } });

        const { data, event } = fireClipboard('copy');

        expect(data.getData('text/plain')).toBe('before kept after');
        expect(event.defaultPrevented).toBe(true);
    });

    it('should not touch an empty selection with an empty clipboard', () => {
        setup(`before ${wrap('aaa', 'kept')} after`);

        const { data, event } = fireClipboard('copy');

        expect(data.getData('text/plain')).toBe('');
        expect(event.defaultPrevented).toBe(false);
    });

    it('should stop handling after cleanup', () => {
        const doc = `before ${wrap('aaa', 'kept')} after`;
        setup(doc);
        cleanup?.();
        cleanup = null;

        const { data } = fireClipboard('copy', doc);

        expect(data.getData('text/plain')).toBe(doc);
    });
});
