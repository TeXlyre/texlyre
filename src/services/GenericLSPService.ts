// src/services/GenericLSPService.ts
import { LSPClient, type LSPClientConfig, languageServerExtensions, type Transport } from '@codemirror/lsp-client';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
type StatusListener = (configId: string, status: ConnectionStatus) => void;

interface LSPServerConfig {
    id: string;
    name: string;
    enabled: boolean;
    fileExtensions: string[];
    transportConfig: {
        type: 'websocket' | 'worker';
        url?: string;
        workerPath?: string;
    };
    clientConfig: LSPClientConfig;
}

class GenericLSPService {
    private clients: Map<string, LSPClient> = new Map();
    private configs: Map<string, LSPServerConfig> = new Map();
    private connectionStatuses: Map<string, ConnectionStatus> = new Map();
    private statusListeners: Set<StatusListener> = new Set();

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

    private async initializeClient(config: LSPServerConfig) {
        this.setConnectionStatus(config.id, 'connecting');

        try {
            const baseLspExtensions = languageServerExtensions();

            const client = new LSPClient({
                ...config.clientConfig,
                extensions: [
                    ...(config.clientConfig.extensions ?? []),
                    ...baseLspExtensions,
                ],
            });

            const transport = this.createTransport(config);
            if (transport) {
                client.connect(transport);
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

        ws.onopen = () => {
            isOpen = true;
            while (messageQueue.length > 0) {
                const message = messageQueue.shift();
                if (message) ws.send(message);
            }
        };

        ws.onmessage = (event) => {
            handlers.forEach(handler => handler(event.data));
        };

        ws.onerror = (error) => {
            console.error('[GenericLSPService] WebSocket error:', error);
            this.setConnectionStatus(config.id, 'error');
        };

        ws.onclose = () => {
            isOpen = false;
            this.setConnectionStatus(config.id, 'disconnected');
            console.log('[GenericLSPService] WebSocket closed');
        };

        return {
            send: (message: string) => {
                if (isOpen && ws.readyState === WebSocket.OPEN) {
                    ws.send(message);
                } else {
                    messageQueue.push(message);
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

        const updated = { ...config, ...updates };
        this.configs.set(configId, updated);

        this.disconnectClient(configId);
        if (updated.enabled && updated.clientConfig) {
            void this.initializeClient(updated);
        }
    }

    cleanup() {
        console.log(`[GenericLSPService] Cleaning up ${this.clients.size} LSP connections`);
        this.clients.forEach((_, configId) => this.disconnectClient(configId));
        this.configs.clear();
        this.connectionStatuses.clear();
        this.statusListeners.clear();
    }
}

export const genericLSPService = new GenericLSPService();