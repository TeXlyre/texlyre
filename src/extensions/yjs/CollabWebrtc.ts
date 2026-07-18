// src/extensions/yjs/CollabWebrtc.ts
import { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';

import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('CollabWebrtc');

interface WebrtcProviderOptions {
	signaling?: string[];
	password?: string;
}

class WebrtcProviderRegistry {
	private providers: Map<
		string,
		{ provider: WebrtcProvider; refCount: number }
	> = new Map();
	getProvider(
		roomName: string,
		doc: Y.Doc,
		options?: WebrtcProviderOptions,
	): WebrtcProvider {
		// console.log('[CollabWebrtc] getProvider', roomName, this.providers.has(roomName), this.getRefCount(roomName));
		if (this.providers.has(roomName)) {
			const entry = this.providers.get(roomName)!;
			entry.refCount += 1;
			return entry.provider;
		}

		try {
			const provider = new WebrtcProvider(roomName, doc, {
				signaling: options?.signaling ?? [],
			});

			this.providers.set(roomName, {
				provider,
				refCount: 1,
			});

			return provider;
		} catch (error) {
			moduleLog.error(
				`Error creating WebRTC provider for room ${roomName}:`,
				error,
			);
			throw error;
		}
	}

	releaseProvider(roomName: string): boolean {
		if (!this.providers.has(roomName)) {
			moduleLog.warn(
				`Attempted to release nonexistent provider for room: ${roomName}`,
			);
			return false;
		}

		const entry = this.providers.get(roomName)!;
		entry.refCount -= 1;

		if (entry.refCount <= 0) {
			moduleLog.info(`Destroying WebRTC provider for room: ${roomName}`);
			try {
				entry.provider.disconnect();
				entry.provider.destroy();
			} catch (error) {
				moduleLog.error(
					`Error destroying WebRTC provider for room ${roomName}:`,
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

export const collabWebrtc = new WebrtcProviderRegistry();
