// src/services/PeerDocumentTrackingService.ts
import type { Awareness } from 'y-protocols/awareness';

import { collabService } from './CollabService';
import type { CollabConnectOptions } from '../types/collab';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('PeerDocumentTracking');

type Listener = (docsWithPeers: Set<string>) => void;

interface ProjectTracker {
	projectId: string;
	awareness: Awareness;
	collabOptions: CollabConnectOptions | null;
	listeners: Set<Listener>;
	backgroundDocs: Set<string>;
	localOpenDocs: Set<string>;
	awarenessHandler: () => void;
	docsWithPeers: Set<string>;
}

class PeerDocumentTrackingService {
	private trackers = new Map<string, ProjectTracker>();

	registerProject(
		projectId: string,
		awareness: Awareness,
		collabOptions: CollabConnectOptions | null,
	): () => void {
		let tracker = this.trackers.get(projectId);
		if (tracker) {
			tracker.awareness = awareness;
			tracker.collabOptions = collabOptions;
			this.publishLocalOpenDocs(tracker);
			this.recompute(tracker);
			return () => this.unregisterProject(projectId);
		}

		const handler = () => {
			const t = this.trackers.get(projectId);
			if (t) this.recompute(t);
		};

		tracker = {
			projectId,
			awareness,
			collabOptions,
			listeners: new Set(),
			backgroundDocs: new Set(),
			localOpenDocs: new Set(),
			awarenessHandler: handler,
			docsWithPeers: new Set(),
		};

		awareness.on('change', handler);
		this.trackers.set(projectId, tracker);
		this.publishLocalOpenDocs(tracker);
		this.recompute(tracker);

		return () => this.unregisterProject(projectId);
	}

	private unregisterProject(projectId: string): void {
		const tracker = this.trackers.get(projectId);
		if (!tracker) return;

		try {
			tracker.awareness.off('change', tracker.awarenessHandler);
			tracker.awareness.setLocalStateField('openDocs', []);
		} catch {}

		for (const docId of tracker.backgroundDocs) {
			collabService.disconnect(projectId, `yjs_${docId}`);
		}
		tracker.backgroundDocs.clear();
		tracker.listeners.clear();
		this.trackers.delete(projectId);
	}

	setLocalOpenDocument(projectId: string, docId: string | null): void {
		const tracker = this.trackers.get(projectId);
		if (!tracker) return;

		tracker.localOpenDocs.clear();
		if (docId) tracker.localOpenDocs.add(docId);
		this.publishLocalOpenDocs(tracker);
		this.recompute(tracker);
	}

	subscribe(projectId: string, listener: Listener): () => void {
		const tracker = this.trackers.get(projectId);
		if (!tracker) return () => {};

		tracker.listeners.add(listener);
		listener(tracker.docsWithPeers);
		return () => {
			tracker.listeners.delete(listener);
		};
	}

	private publishLocalOpenDocs(tracker: ProjectTracker): void {
		try {
			tracker.awareness.setLocalStateField(
				'openDocs',
				Array.from(tracker.localOpenDocs),
			);
		} catch (error) {
			moduleLog.warn('Failed to publish openDocs:', error);
		}
	}

	private recompute(tracker: ProjectTracker): void {
		const remoteOpenDocs = new Set<string>();
		const localClientId = tracker.awareness.clientID;

		for (const [clientId, state] of tracker.awareness.getStates()) {
			if (clientId === localClientId) continue;
			const openDocs = state?.openDocs as string[] | undefined;
			if (!Array.isArray(openDocs)) continue;
			for (const docId of openDocs) {
				if (docId) remoteOpenDocs.add(docId);
			}
		}

		this.reconcileBackgroundConnections(tracker, remoteOpenDocs);

		tracker.docsWithPeers = remoteOpenDocs;
		for (const listener of tracker.listeners) {
			listener(remoteOpenDocs);
		}
	}

	private reconcileBackgroundConnections(
		tracker: ProjectTracker,
		remoteOpenDocs: Set<string>,
	): void {
		for (const docId of remoteOpenDocs) {
			if (tracker.localOpenDocs.has(docId)) continue;
			if (tracker.backgroundDocs.has(docId)) continue;

			try {
				collabService.connect(
					tracker.projectId,
					`yjs_${docId}`,
					tracker.collabOptions ?? {},
				);
				tracker.backgroundDocs.add(docId);
			} catch (error) {
				moduleLog.warn(
					`Failed to open background connection for ${docId}:`,
					error,
				);
			}
		}

		for (const docId of Array.from(tracker.backgroundDocs)) {
			if (tracker.localOpenDocs.has(docId)) {
				tracker.backgroundDocs.delete(docId);
				continue;
			}

			if (remoteOpenDocs.has(docId)) {
				continue;
			}
			collabService.disconnect(tracker.projectId, `yjs_${docId}`);
			tracker.backgroundDocs.delete(docId);
		}
	}
}

export const peerDocumentTrackingService = new PeerDocumentTrackingService();
