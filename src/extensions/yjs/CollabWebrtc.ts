// src/extensions/yjs/CollabWebrtc.ts
import * as random from "lib0/random";
import { WebrtcProvider } from "y-webrtc";
import type * as Y from "yjs";

// Define an interface for the provider options that CollabService will pass
interface WebrtcProviderOptions {
	signaling?: string[]; // Array of signaling server URLs
	// Add other WebrtcProvider options here if needed, e.g., peerCon?: RTCPeerConnectionConfig
}

class WebrtcProviderRegistry {
	private providers: Map<
		string,
		{ provider: WebrtcProvider; refCount: number }
	> = new Map();

	// Removed getSignalingServers() as it's no longer needed here.

	getProvider(
		roomName: string,
		doc: Y.Doc,
		options?: WebrtcProviderOptions,
	): WebrtcProvider {
		if (this.providers.has(roomName)) {
			const entry = this.providers.get(roomName)!;
			entry.refCount += 1;
			return entry.provider;
		}

		try {
			const provider = new WebrtcProvider(roomName, doc, {
				signaling: options?.signaling || ["wss://ywebrtc.emaily.re"],
			});

			this.providers.set(roomName, {
				provider,
				refCount: 1,
			});

			return provider;
		} catch (error) {
			console.error(`Error creating WebRTC provider for room ${roomName}:`, error);
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
			console.log(`[CollabWebrtc] Destroying WebRTC provider for room: ${roomName}`);
			try {
				entry.provider.disconnect();
				entry.provider.destroy();
			} catch (error) {
				console.error(
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
