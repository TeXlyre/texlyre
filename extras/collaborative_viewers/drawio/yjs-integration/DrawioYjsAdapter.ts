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

export class DrawioYjsAdapter {
    private doc: Y.Doc;
    private ymap: Y.Map<any>;
    private awareness?: Awareness;
    private iframeRef: React.RefObject<HTMLIFrameElement>;
    private drawioOrigin: string;
    private onContentChange?: (xml: string) => void;
    private isInitialized = false;
    private pendingXml: string | null = null;
    private messageHandler: ((event: MessageEvent) => void) | null = null;
    private ymapObserver: ((event: Y.YMapEvent<any>, transaction: Y.Transaction) => void) | null = null; private isLocalUpdate = false;
    private updateCounter = 0;
    private ignoreNextObserverCall = false;

    constructor(options: DrawioYjsAdapterOptions) {
        this.doc = options.doc;
        this.ymap = this.doc.getMap('drawio');
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

        this.ymapObserver = (event, transaction) => this.handleYmapChange(event, transaction);
        this.ymap.observe(this.ymapObserver);

        this.isInitialized = true;
    }

    private handleDrawioMessage(event: MessageEvent): void {
        if (event.origin !== this.drawioOrigin) return;
        if (typeof event.data !== 'string') return;

        try {
            const message = JSON.parse(event.data);

            if (message.event === 'init') {
                console.log('[DrawioYjsAdapter] Draw.io initialized, loading content');
                this.loadInitialContent();
            } else if (message.event === 'save') {
                console.log('[DrawioYjsAdapter] Received SAVE event from draw.io');
                this.handleDrawioSave(message.xml);
            } else if (message.event === 'autosave') {
                console.log('[DrawioYjsAdapter] Received AUTOSAVE event from draw.io');
                this.handleDrawioSave(message.xml);
            } else if (message.event === 'export') {
                console.log('[DrawioYjsAdapter] Received export event');
                if (message.xml) {
                    this.handleDrawioSave(message.xml);
                }
            } else if (message.event !== 'load' && message.event !== 'configure') {
                console.log('[DrawioYjsAdapter] Received other event:', message.event);
            }
        } catch (error) {
            console.error('[DrawioYjsAdapter] Error handling message:', error);
        }
    }

    private loadInitialContent(): void {
        if (!this.pendingXml) return;

        try {
            const hasContent = this.ymap.has('xml');
            console.log('[DrawioYjsAdapter] Y.Map has existing content:', hasContent);

            if (!hasContent) {
                console.log('[DrawioYjsAdapter] Y.Doc is empty, initializing from XML');
                this.ignoreNextObserverCall = true;
                this.doc.transact(() => {
                    this.isLocalUpdate = true;
                    this.ymap.set('xml', this.pendingXml!);
                    this.ymap.set('timestamp', Date.now());
                    this.isLocalUpdate = false;
                });
            }

            const xmlToSend = this.ymap.get('xml') as string || this.pendingXml;
            console.log('[DrawioYjsAdapter] Sending initial XML to Draw.io, length:', xmlToSend.length);

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

    private handleDrawioSave(xml: string): void {
        if (!xml) {
            console.warn('[DrawioYjsAdapter] Received empty XML from Draw.io');
            return;
        }

        try {
            const currentXml = this.ymap.get('xml') as string;
            const xmlChanged = currentXml !== xml;

            console.log('[DrawioYjsAdapter] Draw.io save - XML changed:', xmlChanged, 'Current length:', currentXml?.length, 'New length:', xml.length);

            if (xmlChanged) {
                this.updateCounter++;
                console.log('[DrawioYjsAdapter] UPDATE #' + this.updateCounter + ' - Updating Y.Doc from draw.io');

                this.doc.transact(() => {
                    this.isLocalUpdate = true;
                    this.ymap.set('xml', xml);
                    this.ymap.set('timestamp', Date.now());
                    this.ymap.set('updateCounter', this.updateCounter);
                    this.isLocalUpdate = false;
                });

                console.log('[DrawioYjsAdapter] Y.Doc updated successfully');
            }

            if (this.onContentChange) {
                this.onContentChange(xml);
            }

            this.sendToDrawio({ action: 'status', modified: false });
        } catch (error) {
            console.error('[DrawioYjsAdapter] Error handling save:', error);
        }
    }

    private handleYmapChange(event: Y.YMapEvent<any>, transaction: Y.Transaction): void {
        // Skip local changes (they originate from this tab, e.g. draw.io save/autosave)
        if (transaction.local) {
            console.log('[DrawioYjsAdapter] Skipping local transaction (prevents echo-load)');
            return;
        }

        if (this.ignoreNextObserverCall) {
            this.ignoreNextObserverCall = false;
            return;
        }

        const xml = this.ymap.get('xml') as string;
        if (!xml) return;

        this.sendToDrawio({ action: 'load', xml, autosave: 1 });

        this.onContentChange?.(xml);
    }

    private sendToDrawio(message: any): void {
        if (!this.iframeRef.current?.contentWindow) {
            console.warn('[DrawioYjsAdapter] Cannot send to Draw.io - iframe not ready');
            return;
        }

        console.log('[DrawioYjsAdapter] Sending message to Draw.io:', message.action);
        this.iframeRef.current.contentWindow.postMessage(
            JSON.stringify(message),
            this.drawioOrigin
        );
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
                    console.error('Error handling export response:', error);
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

        if (this.ymapObserver) {
            this.ymap.unobserve(this.ymapObserver);
            this.ymapObserver = null;
        }

        this.isInitialized = false;
        this.pendingXml = null;

        console.log('[DrawioYjsAdapter] Destroyed');
    }
}
