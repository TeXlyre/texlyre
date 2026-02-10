// src/extensions/yjs/CollabWebsocket.ts
import { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

interface WebsocketProviderOptions {
    serverUrl: string;
    params?: Record<string, string>;
}

class WebsocketProviderRegistry {
    private providers: Map<
        string,
        { provider: WebsocketProvider; refCount: number }
    > = new Map();

    getProvider(
        roomName: string,
        doc: Y.Doc,
        options: WebsocketProviderOptions,
    ): WebsocketProvider {
        if (this.providers.has(roomName)) {
            const entry = this.providers.get(roomName)!;
            entry.refCount += 1;
            return entry.provider;
        }

        try {
            const provider = new WebsocketProvider(options.serverUrl, roomName, doc, {
                params: options.params,
            });

            this.providers.set(roomName, {
                provider,
                refCount: 1,
            });

            return provider;
        } catch (error) {
            console.error(`Error creating WebSocket provider for room ${roomName}:`, error);
            throw error;
        }
    }

    releaseProvider(roomName: string): boolean {
        if (!this.providers.has(roomName)) {
            console.warn(
                `Attempted to release nonexistent provider for room: ${roomName}`,
            );
            return false;
        }

        const entry = this.providers.get(roomName)!;
        entry.refCount -= 1;

        if (entry.refCount <= 0) {
            console.log(`[CollabWebsocket] Destroying WebSocket provider for room: ${roomName}`);
            try {
                entry.provider.disconnect();
                entry.provider.destroy();
            } catch (error) {
                console.error(
                    `Error destroying WebSocket provider for room ${roomName}:`,
                    error,
                );
            }
            this.providers.delete(roomName);
            return true;
        }

        return false;
    }

    getRefCount(roomName: string): number {
        return this.providers.has(roomName)
            ? this.providers.get(roomName)?.refCount
            : 0;
    }
}

export const collabWebsocket = new WebsocketProviderRegistry();