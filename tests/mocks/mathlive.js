class MockMathfieldElement {
    constructor() {
        this.value = '';
        this.readOnly = false;
        this.className = '';
        this.menuItems = [];
        this._eventListeners = new Map();
    }

    addEventListener(event, handler) {
        if (!this._eventListeners.has(event)) {
            this._eventListeners.set(event, []);
        }
        this._eventListeners.get(event).push(handler);
    }

    removeEventListener(event, handler) {
        if (this._eventListeners.has(event)) {
            const handlers = this._eventListeners.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    dispatchEvent(event) {
        if (this._eventListeners.has(event.type)) {
            this._eventListeners.get(event.type).forEach(handler => handler(event));
        }
        return true;
    }

    focus() { }
    blur() { }
}

MockMathfieldElement.fontsDirectory = '';
MockMathfieldElement.locale = 'en';

module.exports = {
    __esModule: true,
    MathfieldElement: MockMathfieldElement,
    renderMathInDocument: jest.fn(),
    renderMathInElement: jest.fn(),
    convertLatexToMarkup: jest.fn((latex) => `<math>${latex}</math>`),
    convertLatexToMathMl: jest.fn((latex) => `<math>${latex}</math>`),
    convertLatexToSpeakableText: jest.fn((latex) => latex),
};