// src/hooks/usePeerDocumentTracking.ts
import { useEffect, useMemo, useState } from 'react';

import { peerDocumentTrackingService } from '../services/PeerDocumentTrackingService';
import { useCollab } from './useCollab';
import { useEditor } from './useEditor';
import type { YjsDocUrl } from '../types/yjs';

export const usePeerDocumentTracking = (
	docUrl: YjsDocUrl,
): {
	projectId: string;
	docsWithPeers: Set<string>;
	setLocalOpenDocument: (docId: string | null) => void;
} => {
	const { getCollabOptions } = useEditor();
	const { isConnected, getAwareness } = useCollab();
	const [docsWithPeers, setDocsWithPeers] = useState<Set<string>>(new Set());

	const projectId = useMemo(
		() => (docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl),
		[docUrl],
	);

	/* biome-ignore lint/correctness/useExhaustiveDependencies: getCollabOptions identity changes on every settings-driven render; we intentionally read its current value at effect run time and only re-register on projectId or isConnected changes. */
	useEffect(() => {
		if (!projectId) return;

		let teardown: (() => void) | null = null;
		let unsubscribe: (() => void) | null = null;
		let cancelled = false;

		const tryRegister = () => {
			if (cancelled) return;
			const awareness = getAwareness('yjs_metadata');
			if (!awareness) {
				setTimeout(tryRegister, 250);
				return;
			}
			teardown = peerDocumentTrackingService.registerProject(
				projectId,
				awareness,
				getCollabOptions(),
			);
			unsubscribe = peerDocumentTrackingService.subscribe(
				projectId,
				setDocsWithPeers,
			);
		};

		tryRegister();

		return () => {
			cancelled = true;
			unsubscribe?.();
			teardown?.();
		};
	}, [projectId, isConnected]);

	const setLocalOpenDocument = useMemo(
		() => (docId: string | null) =>
			peerDocumentTrackingService.setLocalOpenDocument(projectId, docId),
		[projectId],
	);

	return { projectId, docsWithPeers, setLocalOpenDocument };
};
