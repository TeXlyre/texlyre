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
    private awareness?: Awareness;
    private iframeRef: React.RefObject<HTMLIFrameElement>;
    private drawioOrigin: string;
    private onContentChange?: (xml: string) => void;
    private isInitialized = false;
    private pendingXml: string | null = null;
    private messageHandler: ((event: MessageEvent) => void) | null = null;
    private ymapObserver: ((event: Y.YMapEvent<any>, transaction: Y.Transaction) => void) | null = null;
    private isLocalUpdate = false;
    private updateCounter = 0;
    private ignoreNextObserverCall = false;
    private cursorTrackingEnabled = false;
    private cursorUpdateInterval: number | null = null;

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

        console.log('[DrawioYjsAdapter] Initializing with XML length:', initialXml.length);

        this.pendingXml = initialXml;

        this.messageHandler = this.handleDrawioMessage.bind(this);
        window.addEventListener('message', this.messageHandler);

        this.ymapObserver = (event, transaction) => this.handleYmapChange(event, transaction);
        this.ymap.observe(this.ymapObserver);

        console.log('[DrawioYjsAdapter] Y.Map observer attached');

        this.setupAwarenessHandlers();

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
                setTimeout(() => this.injectCursorTracking(), 1000);
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
            } else if (message.event === 'cursorPosition') {
                this.handleCursorPosition(message.position);
            } else if (message.event && message.event !== 'load' && message.event !== 'configure') {
                console.log('[DrawioYjsAdapter] Received other event:', message.event);
            }
        } catch (error) {
            console.error('[DrawioYjsAdapter] Error handling message:', error);
        }
    }

    private injectCursorTracking(): void {
        if (!this.iframeRef.current?.contentWindow) return;
        console.log('[DrawioYjsAdapter] Injecting cursor tracking');

        const script = `
        (function() {
            const container = document.querySelector('.geDiagramContainer');
            const canvas = document.querySelector('.geBackgroundPage');
            
            if (!container || !canvas) {
                console.warn('Could not find Draw.io container or canvas');
                return;
            }
            
            let lastPosition = null;
            const remoteCursors = new Map();
            
            function getCanvasScale() {
                const transform = window.getComputedStyle(canvas).transform;
                if (transform && transform !== 'none') {
                    const matrix = transform.match(/matrix\\(([^)]+)\\)/);
                    if (matrix) {
                        const values = matrix[1].split(',').map(v => parseFloat(v.trim()));
                        return values[0];
                    }
                }
                return 1;
            }
            
            function getCanvasPosition(e) {
                const canvasRect = canvas.getBoundingClientRect();
                const scale = getCanvasScale();
                
                const scaledOffsetX = e.clientX - canvasRect.left;
                const scaledOffsetY = e.clientY - canvasRect.top;
                
                const unscaledOffsetX = scaledOffsetX / scale;
                const unscaledOffsetY = scaledOffsetY / scale;
                
                const unscaledWidth = canvasRect.width / scale;
                const unscaledHeight = canvasRect.height / scale;
                
                const normalizedX = unscaledOffsetX / unscaledWidth;
                const normalizedY = unscaledOffsetY / unscaledHeight;
                
                return {
                    normalizedX: normalizedX,
                    normalizedY: normalizedY,
                    timestamp: Date.now()
                };
            }
            
            container.addEventListener('mousemove', function(e) {
                const canvasRect = canvas.getBoundingClientRect();
                const isOverCanvas = e.clientX >= canvasRect.left && 
                                   e.clientX <= canvasRect.right && 
                                   e.clientY >= canvasRect.top && 
                                   e.clientY <= canvasRect.bottom;
                
                if (!isOverCanvas) {
                    if (lastPosition !== null) {
                        lastPosition = null;
                        window.parent.postMessage(JSON.stringify({
                            event: 'cursorPosition',
                            position: null
                        }), '*');
                    }
                    return;
                }
                
                const pos = getCanvasPosition(e);
                if (!lastPosition || 
                    Math.abs(pos.normalizedX - lastPosition.normalizedX) > 0.005 || 
                    Math.abs(pos.normalizedY - lastPosition.normalizedY) > 0.005) {
                    lastPosition = pos;
                    window.parent.postMessage(JSON.stringify({
                        event: 'cursorPosition',
                        position: pos
                    }), '*');
                }
            });
            
            container.addEventListener('mouseleave', function() {
                if (lastPosition !== null) {
                    lastPosition = null;
                    window.parent.postMessage(JSON.stringify({
                        event: 'cursorPosition',
                        position: null
                    }), '*');
                }
            });
            
            window.addEventListener('message', function(e) {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.action === 'updateRemoteCursors') {
                        updateRemoteCursors(msg.cursors);
                    }
                } catch (err) {
                    // Ignore
                }
            });
            
            function createCursorElement(user) {
                const cursor = document.createElement('div');
                cursor.className = 'remote-cursor';
                cursor.style.cssText = \`
                    position: fixed;
                    pointer-events: none;
                    z-index: 10000;
                    transition: transform 0.1s ease-out;
                    transform-origin: 0 0;
                    left: 0;
                    top: 0;
                \`;
                
                cursor.innerHTML = \`
                    <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <path d="M5 3 L5 17 L8 14 L11 20 L13 19 L10 13 L15 13 Z" 
                              fill="\${user.color || '#4A90E2'}" 
                              stroke="white" 
                              stroke-width="1"/>
                    </svg>
                    <div style="
                        position: absolute;
                        left: 20px;
                        top: 0;
                        background: \${user.color || '#4A90E2'};
                        color: white;
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        white-space: nowrap;
                        font-family: system-ui, -apple-system, sans-serif;
                    ">\${user.username}</div>
                \`;
                
                document.body.appendChild(cursor);
                return cursor;
            }
            
            function updateRemoteCursors(cursors) {
                const activeCursors = new Set();
                const canvas = document.querySelector('.geBackgroundPage');
                const localCanvasRect = canvas.getBoundingClientRect();
                const localScale = getCanvasScale();
                
                const localUnscaledWidth = localCanvasRect.width / localScale;
                const localUnscaledHeight = localCanvasRect.height / localScale;
                
                cursors.forEach(cursor => {
                    activeCursors.add(cursor.clientId);
                    
                    let cursorElement = remoteCursors.get(cursor.clientId);
                    if (!cursorElement) {
                        cursorElement = createCursorElement(cursor.user);
                        remoteCursors.set(cursor.clientId, cursorElement);
                    }
                    
                    if (cursor.position) {
                        const unscaledOffsetX = cursor.position.normalizedX * localUnscaledWidth;
                        const unscaledOffsetY = cursor.position.normalizedY * localUnscaledHeight;
                        
                        const scaledOffsetX = unscaledOffsetX * localScale;
                        const scaledOffsetY = unscaledOffsetY * localScale;
                        
                        const x = scaledOffsetX + localCanvasRect.left;
                        const y = scaledOffsetY + localCanvasRect.top;
                        
                        cursorElement.style.transform = \`translate(\${x}px, \${y}px)\`;
                        cursorElement.style.display = 'block';
                    } else {
                        cursorElement.style.display = 'none';
                    }
                });
                
                remoteCursors.forEach((element, clientId) => {
                    if (!activeCursors.has(clientId)) {
                        element.remove();
                        remoteCursors.delete(clientId);
                    }
                });
            }
            
            console.log('Draw.io cursor tracking injected successfully');
        })();
    `;

        try {
            const iframe = this.iframeRef.current;
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
                const scriptElement = iframeDoc.createElement('script');
                scriptElement.textContent = script;
                iframeDoc.body.appendChild(scriptElement);
                this.cursorTrackingEnabled = true;
                console.log('[DrawioYjsAdapter] Cursor tracking script injected');
                this.startCursorBroadcasting();
            }
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

            const xmlToSend = (this.ymap.get('xml') as string) || this.pendingXml;
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

    private setupAwarenessHandlers(): void {
        if (!this.awareness) {
            console.log('[DrawioYjsAdapter] No awareness available');
            return;
        }

        console.log('[DrawioYjsAdapter] Setting up awareness handlers');

        this.awareness.on('change', () => {
            const states = this.awareness!.getStates();
            let remoteCount = 0;

            states.forEach((state, clientId) => {
                if (clientId !== this.awareness!.clientID && state.user) {
                    remoteCount++;
                }
            });

            console.log('[DrawioYjsAdapter] Awareness update - local client:', this.awareness!.clientID, 'remote collaborators:', remoteCount);
        });
    }

    private sendToDrawio(message: any): void {
        if (!this.iframeRef.current?.contentWindow) {
            console.warn('[DrawioYjsAdapter] Cannot send to Draw.io - iframe not ready');
            return;
        }

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

        console.log('[DrawioYjsAdapter] Destroyed');
    }
}
