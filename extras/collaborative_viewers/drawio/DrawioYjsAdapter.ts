// extras/collaborative_viewers/drawio/yjs-integration/DrawioYjsAdapter.ts
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

interface DrawioYjsAdapterOptions {
    doc: Y.Doc;
    awareness?: Awareness;
    iframeRef: React.RefObject<HTMLIFrameElement>;
    drawioOrigin: string;
    onContentChange?: (xml: string) => void;
}

interface CursorPosition {
    normalizedX: number;
    normalizedY: number;
    timestamp?: number;
}

export class DrawioYjsAdapter {
    private doc: Y.Doc;
    private ymap: Y.Map<any>;
    private ytext: Y.Text;
    private awareness?: Awareness;
    private iframeRef: React.RefObject<HTMLIFrameElement>;
    private drawioOrigin: string;
    private onContentChange?: (xml: string) => void;
    private isInitialized = false;
    private pendingXml: string | null = null;
    private messageHandler: ((event: MessageEvent) => void) | null = null;
    private ytextObserver: ((event: Y.YTextEvent, transaction: Y.Transaction) => void) | null = null;
    private isLocalUpdate = false;
    private updateCounter = 0;
    private ignoreNextObserverCall = false;
    private cursorTrackingEnabled = false;
    private cursorUpdateInterval: number | null = null;
    private lastValidXml: string | null = null;

    constructor(options: DrawioYjsAdapterOptions) {
        this.doc = options.doc;
        this.ymap = this.doc.getMap('drawio');
        this.ytext = this.doc.getText('drawioXml');
        this.awareness = options.awareness;
        this.iframeRef = options.iframeRef;
        this.drawioOrigin = options.drawioOrigin;
        this.onContentChange = options.onContentChange;
    }

    initialize(initialXml: string): void {
        if (this.isInitialized) return;

        this.pendingXml = initialXml;

        this.messageHandler = this.handleDrawioMessage.bind(this);
        window.addEventListener('message', this.messageHandler);

        this.ytextObserver = (event, transaction) => this.handleYtextChange(event, transaction);
        this.ytext.observe(this.ytextObserver);

        this.setupAwarenessHandlers();

        this.isInitialized = true;
    }

    private isValidXml(xml: string): boolean {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        return !doc.querySelector('parsererror');
    }

    private handleDrawioMessage(event: MessageEvent): void {
        if (event.origin !== this.drawioOrigin) return;
        if (typeof event.data !== 'string') return;

        try {
            const message = JSON.parse(event.data);

            if (message.event === 'init') {
                this.loadInitialContent();
                setTimeout(() => this.injectCursorTracking(), 1000);
            } else if (message.event === 'save' || message.event === 'autosave') {
                this.handleDrawioSave(message.xml);
            } else if (message.event === 'export' && message.xml) {
                this.handleDrawioSave(message.xml);
            } else if (message.event === 'cursorPosition') {
                this.handleCursorPosition(message.position);
            }
        } catch (error) {
            console.error('[DrawioYjsAdapter] Error handling message:', error);
        }
    }

    private async injectCursorTracking(): Promise<void> {
        if (!this.iframeRef.current?.contentWindow) return;

        try {
            const iframe = this.iframeRef.current;
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) return;

            const scriptModule = await import('./drawio-cursor-tracking.js?raw');
            const scriptText = scriptModule.default;

            const scriptElement = iframeDoc.createElement('script');
            scriptElement.textContent = scriptText;
            iframeDoc.body.appendChild(scriptElement);
            this.cursorTrackingEnabled = true;
            this.startCursorBroadcasting();
        } catch (error) {
            console.error('[DrawioYjsAdapter] Error injecting cursor tracking:', error);
        }
    }

    private startCursorBroadcasting(): void {
        if (this.cursorUpdateInterval) return;

        this.cursorUpdateInterval = window.setInterval(() => {
            if (!this.awareness) return;

            const states = this.awareness.getStates();
            const remoteCursors: Array<{
                clientId: number;
                user: any;
                position?: CursorPosition;
            }> = [];

            states.forEach((state, clientId) => {
                if (clientId === this.awareness!.clientID) return;
                if (!state.user) return;

                remoteCursors.push({
                    clientId,
                    user: state.user,
                    position: state.cursor as CursorPosition | undefined
                });
            });

            this.sendToDrawio({
                action: 'updateRemoteCursors',
                cursors: remoteCursors
            });
        }, 100);
    }

    private handleCursorPosition(position: CursorPosition): void {
        if (!this.awareness) return;

        this.awareness.setLocalStateField('cursor', {
            ...position,
            timestamp: Date.now()
        });
    }

    private loadInitialContent(): void {
        if (!this.pendingXml) return;

        try {
            const hasContent = this.ytext.length > 0;

            if (!hasContent) {
                this.ignoreNextObserverCall = true;
                this.doc.transact(() => {
                    this.isLocalUpdate = true;
                    this.ytext.insert(0, this.pendingXml!);
                    this.ymap.set('timestamp', Date.now());
                    this.isLocalUpdate = false;
                });
            }

            const xmlToSend = this.ytext.length > 0 ? this.ytext.toString() : this.pendingXml;

            this.sendToDrawio({
                action: 'load',
                xml: xmlToSend,
                autosave: 1
            });

            this.pendingXml = null;
        } catch (error) {
            console.error('[DrawioYjsAdapter] Error loading initial content:', error);
        }
    }

    private applyStringPatch(next: string): boolean {
        const prev = this.ytext.toString();
        if (prev === next) return false;

        let start = 0;
        const prevLen = prev.length;
        const nextLen = next.length;
        const minLen = Math.min(prevLen, nextLen);

        while (start < minLen && prev.charCodeAt(start) === next.charCodeAt(start)) start++;

        let endPrev = prevLen;
        let endNext = nextLen;

        while (
            endPrev > start &&
            endNext > start &&
            prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)
        ) {
            endPrev--;
            endNext--;
        }

        const deleteCount = endPrev - start;
        const insertText = next.slice(start, endNext);

        if (deleteCount > 0) this.ytext.delete(start, deleteCount);
        if (insertText) this.ytext.insert(start, insertText);

        return true;
    }

    private handleDrawioSave(xml: string): void {
        if (!xml) {
            console.warn('[DrawioYjsAdapter] Empty XML received');
            return;
        }

        try {
            const currentXml = this.ytext.toString();
            const xmlChanged = currentXml !== xml;

            if (xmlChanged) {
                this.updateCounter++;

                this.doc.transact(() => {
                    this.isLocalUpdate = true;
                    if (this.isValidXml(xml)) {
                        this.lastValidXml = xml;
                        this.applyStringPatch(xml);
                    } else if (this.lastValidXml) {
                        this.sendToDrawio({ action: 'load', xml: this.lastValidXml });
                    }
                    this.ymap.set('timestamp', Date.now());
                    this.ymap.set('updateCounter', this.updateCounter);
                    this.isLocalUpdate = false;
                });
            }

            if (this.onContentChange) {
                this.onContentChange(xml);
            }

            this.sendToDrawio({ action: 'status', modified: false });
        } catch (error) {
            console.error('[DrawioYjsAdapter] Error handling save:', error);
        }
    }

    private handleYtextChange(_event: Y.YTextEvent, transaction: Y.Transaction): void {
        if (transaction.local) return;
        if (this.ignoreNextObserverCall) {
            this.ignoreNextObserverCall = false;
            return;
        }
        const xml = this.ytext.toString();
        if (!xml) return;
        this.sendToDrawio({ action: 'merge', xml });
        this.onContentChange?.(xml);
    }

    private setupAwarenessHandlers(): void {
        if (!this.awareness) return;

        this.awareness.on('change', () => {
            const states = this.awareness!.getStates();
            let remoteCount = 0;

            states.forEach((state, clientId) => {
                if (clientId !== this.awareness!.clientID && state.user) {
                    remoteCount++;
                }
            });
        });
    }

    private sendToDrawio(message: any): void {
        if (!this.iframeRef.current?.contentWindow) return;
        this.iframeRef.current.contentWindow.postMessage(JSON.stringify(message), this.drawioOrigin);
    }

    requestExport(format: string, options: any): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Export timeout'));
            }, 30000);

            const exportHandler = (event: MessageEvent) => {
                if (event.origin !== this.drawioOrigin) return;

                try {
                    const message = JSON.parse(event.data);
                    if (message.event === 'export') {
                        clearTimeout(timeout);
                        window.removeEventListener('message', exportHandler);
                        resolve(message.data);
                    }
                } catch (error) {
                    console.error('[DrawioYjsAdapter] Export error:', error);
                }
            };

            window.addEventListener('message', exportHandler);

            const exportMessage: any = {
                action: 'export',
                format,
                ...options
            };

            this.sendToDrawio(exportMessage);
        });
    }

    destroy(): void {
        if (this.messageHandler) {
            window.removeEventListener('message', this.messageHandler);
            this.messageHandler = null;
        }

        if (this.ytextObserver) {
            this.ytext.unobserve(this.ytextObserver);
            this.ytextObserver = null;
        }

        if (this.cursorUpdateInterval) {
            window.clearInterval(this.cursorUpdateInterval);
            this.cursorUpdateInterval = null;
        }

        if (this.awareness) {
            this.awareness.setLocalStateField('user', null);
            this.awareness.setLocalStateField('cursor', null);
        }

        this.isInitialized = false;
        this.pendingXml = null;
        this.cursorTrackingEnabled = false;
    }
}