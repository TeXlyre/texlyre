// src/services/GenericLSPService.ts
import { LSPClient, type LSPClientConfig, type Transport } from '@codemirror/lsp-client';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
type StatusListener = (configId: string, status: ConnectionStatus) => void;
type DiagnosticListener = (configId: string, params: any) => void;

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

class GenericLSPService {
    private clients: Map<string, LSPClient> = new Map();
    private configs: Map<string, LSPServerConfig> = new Map();
    private connectionStatuses: Map<string, ConnectionStatus> = new Map();
    private statusListeners: Set<StatusListener> = new Set();
    private diagnosticListeners: Set<DiagnosticListener> = new Set();

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

    getLanguageIdMap(configId: string): Record<string, string> | undefined {
        return this.configs.get(configId)?.languageIdMap;
    }

    getConfigId(client: LSPClient): string | undefined {
        for (const [configId, c] of this.clients.entries()) {
            if (c === client) return configId;
        }
        return undefined;
    }

    private async initializeClient(config: LSPServerConfig) {
        this.setConnectionStatus(config.id, 'connecting');

        try {
            const client = new LSPClient({
                ...config.clientConfig,
                extensions: [],
            });

            const transport = this.createTransport(config);
            if (transport) {
                const wrappedTransport = this.wrapTransportForDiagnostics(config.id, transport);
                client.connect(wrappedTransport);
                this.clients.set(config.id, client);
                this.setConnectionStatus(config.id, 'connected');
                console.log(`[GenericLSPService] Connected to LSP server: ${config.name}`);
            } else {
                this.setConnectionStatus(config.id, 'error');
            }
        } catch (error) {
            console.error(`[GenericLSPService] Failed to connect to ${config.name}:`, error);
            this.setConnectionStatus(config.id, 'error');
        }
    }

    private wrapTransportForDiagnostics(configId: string, transport: Transport): Transport {
        const self = this;
        return {
            send: transport.send.bind(transport),
            subscribe(handler: (value: string) => void) {
                transport.subscribe((message: string) => {
                    try {
                        const parsed = JSON.parse(message);
                        if (parsed.method === 'textDocument/publishDiagnostics' && parsed.params) {
                            self.diagnosticListeners.forEach(listener => {
                                try {
                                    listener(configId, parsed.params);
                                } catch (error) {
                                    console.error('[GenericLSPService] Diagnostic listener error:', error);
                                }
                            });
                        }
                    } catch { }
                    handler(message);
                });
            },
            unsubscribe: transport.unsubscribe?.bind(transport),
        };
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
        let isOpen = false;
        const useContentLength = config.transportConfig.contentLength ?? false;
        let buffer = '';

        const dispatchMessage = (message: string) => {
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

    getClient(configId: string): LSPClient | null {
        return this.clients.get(configId) ?? null;
    }

    getClientForFile(fileName: string): LSPClient | null {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (!ext) return null;

        for (const [configId, config] of this.configs.entries()) {
            if (config.enabled && config.fileExtensions.includes(ext)) {
                const client = this.clients.get(configId);
                if (client) {
                    console.log(`[GenericLSPService] Using LSP server for ${fileName}: ${config.name}`);
                }
                return client || null;
            }
        }
        return null;
    }

    getAllClientsForFile(fileName: string): LSPClient[] {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (!ext) return [];

        const clients: LSPClient[] = [];
        for (const [configId, config] of this.configs.entries()) {
            if (config.enabled && config.fileExtensions.includes(ext)) {
                const client = this.clients.get(configId);
                if (client) {
                    console.log(`[GenericLSPService] Using LSP server for ${fileName}: ${config.name}`);
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

        const hasConnectionChanges =
            updates.transportConfig !== undefined ||
            updates.clientConfig !== undefined;

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
    }
}

export const genericLSPService = new GenericLSPService();