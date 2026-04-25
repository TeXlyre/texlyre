// src/services/GenericLSPService.ts
import { LSPClient, type LSPClientConfig, type Transport } from '@codemirror/lsp-client';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
type StatusListener = (configId: string, status: ConnectionStatus) => void;
type DiagnosticListener = (configId: string, params: any) => void;
type ApplyEditListener = (configId: string, edit: any) => void;

interface LSPServerConfig {
    id: string;
    name: string;
    enabled: boolean;
    fileExtensions: string[];
    languageIdMap?: Record<string, string>;
    transportConfig: {
        type: 'websocket' | 'worker';
        url?: string;
        workerPath?: string;
        contentLength?: boolean;
    };
    clientConfig: LSPClientConfig;
}

const HANDSHAKE_INIT_ID = -10001;

const defaultClientCapabilities = {
    textDocument: {
        synchronization: { didSave: true, willSave: false, willSaveWaitUntil: false },
        publishDiagnostics: { relatedInformation: true },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        completion: { completionItem: { snippetSupport: false } },
        codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix'] } } },
    },
    workspace: { workspaceFolders: true, configuration: true, applyEdit: true },
    window: { workDoneProgress: false },
};

class GenericLSPService {
    private clients: Map<string, LSPClient> = new Map();
    private configs: Map<string, LSPServerConfig> = new Map();
    private connectionStatuses: Map<string, ConnectionStatus> = new Map();
    private statusListeners: Set<StatusListener> = new Set();
    private diagnosticListeners: Set<DiagnosticListener> = new Set();
    private applyEditListeners: Set<ApplyEditListener> = new Set();

    registerConfig(config: LSPServerConfig) {
        this.configs.set(config.id, config);
        this.setConnectionStatus(config.id, 'disconnected');

        if (config.enabled && config.clientConfig) {
            console.log(`[GenericLSPService] Registering LSP server: ${config.name} (${config.id})`);
            this.initializeClient(config);
        }
    }

    unregisterConfig(configId: string) {
        this.disconnectClient(configId);
        this.configs.delete(configId);
        this.connectionStatuses.delete(configId);
    }

    private setConnectionStatus(configId: string, status: ConnectionStatus) {
        this.connectionStatuses.set(configId, status);
        this.statusListeners.forEach(listener => {
            try {
                listener(configId, status);
            } catch (error) {
                console.error('[GenericLSPService] Status listener error:', error);
            }
        });
    }

    getConnectionStatus(configId: string): ConnectionStatus {
        return this.connectionStatuses.get(configId) ?? 'disconnected';
    }

    onStatusChange(listener: StatusListener): () => void {
        this.statusListeners.add(listener);
        return () => this.statusListeners.delete(listener);
    }

    onDiagnostics(listener: DiagnosticListener): () => void {
        this.diagnosticListeners.add(listener);
        return () => this.diagnosticListeners.delete(listener);
    }

    onApplyEdit(listener: ApplyEditListener): () => void {
        this.applyEditListeners.add(listener);
        return () => this.applyEditListeners.delete(listener);
    }

    getLanguageIdMap(configId: string): Record<string, string> | undefined {
        return this.configs.get(configId)?.languageIdMap;
    }

    getConfigId(client: LSPClient): string | undefined {
        for (const [configId, c] of this.clients.entries()) {
            if (c === client) return configId;
        }
        return undefined;
    }

    getClient(configId: string): LSPClient | null {
        return this.clients.get(configId) ?? null;
    }

    private async initializeClient(config: LSPServerConfig) {
        this.setConnectionStatus(config.id, 'connecting');

        try {
            const { capabilities: userCapabilities, ...restClientConfig } =
                config.clientConfig as LSPClientConfig & { capabilities?: Record<string, any> };

            const client = new LSPClient({
                ...restClientConfig,
                extensions: [],
            });

            const transport = this.createTransport(config);
            if (!transport) {
                this.setConnectionStatus(config.id, 'error');
                return;
            }

            const wrappedTransport = this.wrapTransport(
                config.id,
                transport,
                userCapabilities,
                restClientConfig as LSPClientConfig,
            );
            client.connect(wrappedTransport);
            this.clients.set(config.id, client);
            this.setConnectionStatus(config.id, 'connected');
            console.log(`[GenericLSPService] Connected to LSP server: ${config.name}`);
        } catch (error) {
            console.error(`[GenericLSPService] Failed to connect to ${config.name}:`, error);
            this.setConnectionStatus(config.id, 'error');
        }
    }

    private mergeCapabilities(defaults: any, overrides: any): any {
        if (!overrides) return defaults;
        if (!defaults) return overrides;

        const result: Record<string, any> = { ...defaults };
        for (const key of Object.keys(overrides)) {
            const a = result[key];
            const b = overrides[key];
            if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
                result[key] = this.mergeCapabilities(a, b);
            } else {
                result[key] = b;
            }
        }
        return result;
    }

    private wrapTransport(
        configId: string,
        transport: Transport,
        userCapabilities: Record<string, any> | undefined,
        clientConfig: LSPClientConfig,
    ): Transport {
        const self = this;
        let handshakeComplete = false;
        const outgoingQueue: string[] = [];
        let downstreamHandler: ((value: string) => void) | null = null;

        const sendInitialize = () => {
            const initParams: any = {
                processId: null,
                clientInfo: { name: 'TeXlyre' },
                rootUri: (clientConfig as any).rootUri ?? null,
                workspaceFolders: (clientConfig as any).workspaceFolders ?? [],
                capabilities: self.mergeCapabilities(defaultClientCapabilities, userCapabilities),
                initializationOptions: (clientConfig as any).initializationOptions,
            };
            transport.send(JSON.stringify({
                jsonrpc: '2.0',
                id: HANDSHAKE_INIT_ID,
                method: 'initialize',
                params: initParams,
            }));
        };

        const completeHandshake = (capabilities: any) => {
            transport.send(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }));
            handshakeComplete = true;

            // Patch the LSP client with the real server capabilities. The client received
            // synthetic capabilities earlier to avoid timing out; this overwrite happens
            // before any user-driven feature request reads serverCapabilities.
            const client = self.clients.get(configId);
            if (client) {
                (client as any).serverCapabilities = capabilities ?? {};
            }

            while (outgoingQueue.length > 0) {
                const queued = outgoingQueue.shift();
                if (queued) transport.send(queued);
            }
        };

        transport.subscribe((message: string) => {
            try {
                const parsed = JSON.parse(message);

                if (!handshakeComplete && parsed.id === HANDSHAKE_INIT_ID && parsed.result) {
                    completeHandshake(parsed.result.capabilities);
                    return;
                }

                if (parsed.method === 'workspace/configuration' && parsed.id !== undefined) {
                    const items = parsed.params?.items || [];
                    const result = items.map(() => ({}));
                    transport.send(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result }));
                    return;
                }

                if (parsed.method === 'textDocument/publishDiagnostics' && parsed.params) {
                    self.diagnosticListeners.forEach(listener => {
                        try {
                            listener(configId, parsed.params);
                        } catch (error) {
                            console.error('[GenericLSPService] Diagnostic listener error:', error);
                        }
                    });
                }

                if (parsed.method === 'workspace/applyEdit' && parsed.id !== undefined) {
                    self.handleApplyEditRequest(configId, parsed.id, parsed.params, transport);
                }
            } catch { }

            if (downstreamHandler) downstreamHandler(message);
        });

        sendInitialize();

        return {
            send: (message: string) => {
                try {
                    const parsed = JSON.parse(message);
                    if (parsed.method === 'initialize' && parsed.id !== undefined) {
                        const fakeResponse = JSON.stringify({
                            jsonrpc: '2.0',
                            id: parsed.id,
                            result: {
                                capabilities: self.mergeCapabilities(defaultClientCapabilities, userCapabilities),
                            },
                        });
                        // Defer so the LSP client's subscribe() runs first.
                        setTimeout(() => downstreamHandler?.(fakeResponse), 0);
                        return;
                    }
                    if (parsed.method === 'initialized') {
                        return;
                    }
                } catch { }

                if (handshakeComplete) {
                    transport.send(message);
                } else {
                    outgoingQueue.push(message);
                }
            },
            subscribe: (handler: (value: string) => void) => {
                downstreamHandler = handler;
            },
            unsubscribe: () => {
                downstreamHandler = null;
            },
        };
    }

    private handleApplyEditRequest(configId: string, requestId: number, params: any, transport: Transport) {
        this.applyEditListeners.forEach(listener => {
            try {
                listener(configId, params?.edit);
            } catch (error) {
                console.error('[GenericLSPService] Apply edit listener error:', error);
            }
        });

        const response = JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { applied: true } });
        transport.send(response);
    }

    private createTransport(config: LSPServerConfig): Transport | null {
        if (config.transportConfig.type === 'websocket' && config.transportConfig.url) {
            return this.createWebSocketTransport(config);
        }
        return null;
    }

    private createWebSocketTransport(config: LSPServerConfig): Transport {
        const url = config.transportConfig.url!;
        const ws = new WebSocket(url);
        const handlers = new Set<(value: string) => void>();
        const messageQueue: string[] = [];
        const pendingMessages: string[] = [];
        let isOpen = false;
        const useContentLength = config.transportConfig.contentLength ?? false;
        let buffer = '';

        const dispatchMessage = (message: string) => {
            if (handlers.size === 0) {
                pendingMessages.push(message);
                return;
            }
            handlers.forEach(handler => handler(message));
        };

        const processBuffer = () => {
            while (buffer.length > 0) {
                const headerEnd = buffer.indexOf('\r\n\r\n');
                if (headerEnd === -1) break;

                const header = buffer.substring(0, headerEnd);
                const match = header.match(/Content-Length:\s*(\d+)/i);
                if (!match) break;

                const contentLength = parseInt(match[1], 10);
                const bodyStart = headerEnd + 4;

                if (buffer.length < bodyStart + contentLength) break;

                const body = buffer.substring(bodyStart, bodyStart + contentLength);
                buffer = buffer.substring(bodyStart + contentLength);
                dispatchMessage(body);
            }
        };

        const wrapWithContentLength = (message: string): string => {
            const byteLength = new TextEncoder().encode(message).length;
            return `Content-Length: ${byteLength}\r\n\r\n${message}`;
        };

        ws.onopen = () => {
            isOpen = true;
            while (messageQueue.length > 0) {
                const message = messageQueue.shift();
                if (message) ws.send(message);
            }
        };

        ws.onmessage = (event) => {
            const data = typeof event.data === 'string' ? event.data : '';

            if (useContentLength) {
                buffer += data;
                processBuffer();
            } else {
                dispatchMessage(data);
            }
        };

        ws.onerror = (error) => {
            console.error('[GenericLSPService] WebSocket error:', error);
            this.setConnectionStatus(config.id, 'error');
        };

        ws.onclose = () => {
            isOpen = false;
            buffer = '';
            this.setConnectionStatus(config.id, 'disconnected');
        };

        return {
            send: (message: string) => {
                const payload = useContentLength ? wrapWithContentLength(message) : message;
                if (isOpen && ws.readyState === WebSocket.OPEN) {
                    ws.send(payload);
                } else {
                    messageQueue.push(payload);
                }
            },
            subscribe: (handler: (value: string) => void) => {
                handlers.add(handler);
                if (pendingMessages.length > 0) {
                    const queued = pendingMessages.splice(0);
                    queued.forEach(msg => handler(msg));
                }
            },
            unsubscribe: (handler: (value: string) => void) => {
                handlers.delete(handler);
            }
        };
    }

    private disconnectClient(configId: string) {
        const client = this.clients.get(configId);
        if (client) {
            try {
                client.disconnect();
                console.log(`[GenericLSPService] Disconnecting from LSP server: ${configId}`);
            } catch (error) {
                console.error(`Error disconnecting LSP client ${configId}:`, error);
            }
            this.clients.delete(configId);
        }
        this.setConnectionStatus(configId, 'disconnected');
    }

    reconnect(configId: string) {
        const config = this.configs.get(configId);
        if (!config) return;

        this.disconnectClient(configId);
        if (config.enabled && config.clientConfig) {
            void this.initializeClient(config);
        }
    }

    getAllClientsForFile(fileName: string): LSPClient[] {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (!ext) return [];

        const clients: LSPClient[] = [];
        for (const [configId, config] of this.configs.entries()) {
            if (config.enabled && config.fileExtensions.includes(ext)) {
                const client = this.clients.get(configId);
                if (client) {
                    clients.push(client);
                }
            }
        }
        return clients;
    }

    updateConfig(configId: string, updates: Partial<LSPServerConfig>) {
        const config = this.configs.get(configId);
        if (!config) return;

        const wasEnabled = config.enabled;
        const updated = { ...config, ...updates };
        this.configs.set(configId, updated);

        const transportChanged =
            updates.transportConfig !== undefined &&
            JSON.stringify(updates.transportConfig) !== JSON.stringify(config.transportConfig);
        const clientConfigChanged =
            updates.clientConfig !== undefined &&
            JSON.stringify(updates.clientConfig) !== JSON.stringify(config.clientConfig);
        const hasConnectionChanges = transportChanged || clientConfigChanged;

        if (!updated.enabled) {
            if (wasEnabled) {
                this.disconnectClient(configId);
            }
            return;
        }

        if (!wasEnabled && updated.enabled) {
            if (updated.clientConfig) {
                void this.initializeClient(updated);
            }
            return;
        }

        if (hasConnectionChanges) {
            this.disconnectClient(configId);
            if (updated.clientConfig) {
                void this.initializeClient(updated);
            }
        }
    }

    cleanup() {
        console.log(`[GenericLSPService] Cleaning up ${this.clients.size} LSP connections`);
        this.clients.forEach((_, configId) => this.disconnectClient(configId));
        this.configs.clear();
        this.connectionStatuses.clear();
        this.statusListeners.clear();
        this.diagnosticListeners.clear();
        this.applyEditListeners.clear();
    }
}

export const genericLSPService = new GenericLSPService();