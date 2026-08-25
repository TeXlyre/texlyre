// src/contexts/SharedToolsContext.tsx
import type React from 'react';
import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';

import { useAuth } from '../hooks/useAuth';
import { useCollab } from '../hooks/useCollab';
import { useLSPConfig } from '../hooks/useLSPConfig';
import { useSharedToolPreferences } from '../hooks/useSharedToolPreferences';
import { useTypesetterConfig } from '../hooks/useTypesetterConfig';
import type { TypesetterServerConfig } from '../services/GenericTypesetterService';
import { typesetterRegistryService } from '../services/TypesetterRegistryService';
import type { DocumentList } from '../types/documents';
import type { LSPConfigBlock } from '../types/lsp';
import type {
	ObservedSharedTool,
	SharedByMeTool,
	SharedLocalTool,
	SharedToolKind,
	SharedToolOffer,
} from '../types/sharedTools';
import type { ToolConfigBlock } from '../types/toolConfig';
import {
	SHARED_TOOLS_AWARENESS_FIELD,
	buildSharedToolAdvertisement,
	classifySharedToolConflict,
	describeSharedToolAvailability,
	localSharedToolKey,
	projectSharingKey,
	readSharedToolsFromAwareness,
	selectAdvertisedTools,
	sharedToolIdentity,
} from '../utils/sharedToolsUtils';

interface SharedToolsContextType {
	offers: SharedToolOffer[];
	pendingCount: number;
	accept: (offer: SharedToolOffer) => void;
	ignore: (offer: SharedToolOffer) => void;
	sharedByMe: SharedByMeTool[];
	globallySharedTools: SharedLocalTool[];
	projectUsedTools: SharedLocalTool[];
	projectAdditionalTools: SharedLocalTool[];
	projectShareEnabled: boolean;
	setProjectShareEnabled: (enabled: boolean) => void;
}

export const SharedToolsContext = createContext<SharedToolsContextType | null>(
	null,
);

interface SharedToolsProviderProps {
	children: ReactNode;
	docUrl: string;
}

const uniqueTools = (tools: SharedLocalTool[]): SharedLocalTool[] => {
	const seen = new Set<string>();
	return tools.filter((tool) => {
		const key = localSharedToolKey(tool.kind, tool.config.id);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const dismissToast = (identity: string) => {
	document.dispatchEvent(
		new CustomEvent('toast-notification', {
			detail: {
				type: 'dismiss',
				message: '',
				operationId: `shared-tool:${identity}`,
			},
		}),
	);
};

export const SharedToolsProvider: React.FC<SharedToolsProviderProps> = ({
	children,
	docUrl,
}) => {
	const { user } = useAuth();
	const { data: doc, provider } = useCollab<DocumentList>();
	const typesetters = useTypesetterConfig();
	const lsps = useLSPConfig();
	const preferences = useSharedToolPreferences();
	const [observed, setObserved] = useState<ObservedSharedTool[]>([]);
	const notifiedRef = useRef(new Set<string>());
	const projectKey = projectSharingKey(docUrl);

	const tools = useMemo(() => {
		const projectType = doc?.projectMetadata?.type ?? 'latex';
		const compilerId = doc?.projectMetadata?.compilerId;
		const providerConfig = typesetterRegistryService.resolve(
			projectType,
			compilerId,
		);
		const usedTypesetterId =
			providerConfig?.source === 'chelys' ? providerConfig.id : null;
		const usedLspIds = new Set(
			(doc?.documents ?? []).flatMap((document) =>
				lsps.getConfigsForFile(document.name).map((config) => config.id),
			),
		);

		const makeTool = (
			kind: SharedToolKind,
			config: ToolConfigBlock,
			usedByProject: boolean,
		): SharedLocalTool => {
			const share = describeSharedToolAvailability(config);
			return {
				kind,
				config,
				shareable: share.shareable,
				shareMessage: share.message,
				sharedWithAll: preferences.isSharedWithAll(kind, config.id),
				usedByProject,
			};
		};

		return uniqueTools([
			...typesetters.configs
				.filter((config) => config.enabled)
				.map((config) =>
					makeTool('typesetter', config, config.id === usedTypesetterId),
				),
			...lsps.configs
				.filter((config) => config.enabled)
				.map((config) => makeTool('lsp', config, usedLspIds.has(config.id))),
		]);
	}, [
		doc?.documents,
		doc?.projectMetadata?.compilerId,
		doc?.projectMetadata?.type,
		typesetters.configs,
		lsps.configs,
		lsps.getConfigsForFile,
		preferences.preferences.shareWithAll,
	]);

	const projectShareEnabled = preferences.isShareProjectTools(projectKey);
	const globallySharedTools = tools.filter(
		(tool) => tool.sharedWithAll && tool.shareable,
	);
	const projectUsedTools = tools.filter((tool) => tool.usedByProject);
	const projectAdditionalTools = projectUsedTools.filter(
		(tool) => !tool.sharedWithAll,
	);
	const advertisedTools = selectAdvertisedTools(tools, projectShareEnabled);
	const sharedByMe: SharedByMeTool[] = advertisedTools.map((tool) => ({
		...tool,
		scope: tool.sharedWithAll ? 'all' : 'project',
	}));

	const localConfigs = useCallback(
		(kind: SharedToolKind): ToolConfigBlock[] =>
			kind === 'typesetter'
				? [...typesetters.configs, ...typesetters.disabledConfigs]
				: [...lsps.configs, ...lsps.disabledConfigs],
		[
			typesetters.configs,
			typesetters.disabledConfigs,
			lsps.configs,
			lsps.disabledConfigs,
		],
	);

	const addConfig = useCallback(
		(kind: SharedToolKind, config: ToolConfigBlock) => {
			if (kind === 'typesetter') {
				typesetters.addConfigs([config as TypesetterServerConfig]);
			} else {
				lsps.addConfigs([config as LSPConfigBlock]);
			}
		},
		[typesetters.addConfigs, lsps.addConfigs],
	);

	const removeConfig = useCallback(
		(kind: SharedToolKind, id: string) => {
			if (kind === 'typesetter') typesetters.removeConfig(id);
			else lsps.removeConfig(id);
		},
		[typesetters.removeConfig, lsps.removeConfig],
	);

	useEffect(() => {
		const awareness = provider?.awareness;
		if (!awareness || !user?.id) return;

		const owner = { id: user.id, name: user.name || user.username };
		const advertisements = advertisedTools.map((tool) =>
			buildSharedToolAdvertisement(
				tool.kind,
				tool.config,
				owner,
				preferences.getOrigin(tool.kind, tool.config.id),
			),
		);
		const current = awareness.getLocalState()?.[SHARED_TOOLS_AWARENESS_FIELD];
		if (JSON.stringify(current) !== JSON.stringify(advertisements)) {
			awareness.setLocalStateField(
				SHARED_TOOLS_AWARENESS_FIELD,
				advertisements,
			);
		}
	}, [
		provider?.awareness,
		user?.id,
		user?.name,
		user?.username,
		advertisedTools,
		preferences.preferences.origins,
	]);

	useEffect(() => {
		const awareness = provider?.awareness;
		if (!awareness) {
			setObserved([]);
			return;
		}

		const update = () =>
			setObserved(readSharedToolsFromAwareness(awareness, user?.id));
		awareness.on('change', update);
		update();
		return () => awareness.off('change', update);
	}, [provider?.awareness, user?.id]);

	const offers = useMemo<SharedToolOffer[]>(
		() =>
			observed.map((tool) => {
				const identity = sharedToolIdentity(
					tool.kind,
					tool.ownerId,
					tool.toolId,
				);
				const conflict = classifySharedToolConflict(
					tool,
					localConfigs(tool.kind),
				);
				const decision = preferences.getDecision(identity);
				const localId = decision?.localId ?? conflict.localId;

				if (conflict.kind === 'same-id-same-config' && !decision) {
					return {
						...tool,
						identity,
						conflict,
						status: 'using-existing',
						localId,
					};
				}
				if (decision?.decision === 'ignored') {
					return { ...tool, identity, conflict, status: 'ignored', localId };
				}
				if (decision?.decision === 'accepted') {
					return { ...tool, identity, conflict, status: 'accepted', localId };
				}
				return { ...tool, identity, conflict, status: 'new', localId };
			}),
		[observed, localConfigs, preferences.preferences.decisions],
	);

	const accept = useCallback(
		(offer: SharedToolOffer) => {
			const sameExisting = offer.conflict.kind === 'same-id-same-config';
			if (!sameExisting) addConfig(offer.kind, offer.config);
			preferences.recordAccepted(
				offer.kind,
				offer,
				offer.toolId,
				!sameExisting,
			);
			dismissToast(offer.identity);
		},
		[addConfig, preferences.recordAccepted],
	);

	const ignore = useCallback(
		(offer: SharedToolOffer) => {
			const previous = preferences.getDecision(offer.identity);
			if (
				previous?.decision === 'accepted' &&
				previous.imported &&
				previous.localId
			) {
				const origin = preferences.getOrigin(offer.kind, previous.localId);
				if (
					origin?.ownerId === offer.ownerId &&
					origin.toolId === offer.toolId
				) {
					removeConfig(offer.kind, previous.localId);
				}
			}
			preferences.recordIgnored(offer.identity, offer.revision);
			dismissToast(offer.identity);
		},
		[
			preferences.getDecision,
			preferences.getOrigin,
			preferences.recordIgnored,
			removeConfig,
		],
	);

	useEffect(() => {
		for (const offer of offers) {
			const decision = preferences.getDecision(offer.identity);
			if (
				decision?.decision === 'accepted' &&
				decision.imported &&
				decision.revision !== offer.revision
			) {
				addConfig(offer.kind, offer.config);
				preferences.recordAccepted(offer.kind, offer, offer.toolId, true);
			}
		}
	}, [offers, addConfig, preferences.getDecision, preferences.recordAccepted]);

	useEffect(() => {
		for (const offer of offers) {
			if (offer.status !== 'new') continue;
			const notificationKey = `${offer.identity}:${offer.revision}`;
			if (notifiedRef.current.has(notificationKey)) continue;
			notifiedRef.current.add(notificationKey);

			const sameName = offer.conflict.kind === 'same-name';
			const sameIdConflict = offer.conflict.kind === 'same-id-different-config';
			document.dispatchEvent(
				new CustomEvent('toast-notification', {
					detail: {
						type: 'info',
						message: sameIdConflict
							? `${offer.ownerName} shared ${offer.name}. A different local tool already uses this ID.`
							: sameName
								? `${offer.ownerName} shared ${offer.name}. You already have a tool with this name.`
								: `${offer.ownerName} is sharing ${offer.name}.`,
						operationId: `shared-tool:${offer.identity}`,
						duration: 0,
						actions: [
							{
								label: sameIdConflict
									? 'Replace mine'
									: sameName
										? 'Add shared'
										: 'Use',
								variant: 'primary',
								onClick: () => accept(offer),
							},
							{
								label: sameIdConflict || sameName ? 'Keep mine' : 'Ignore',
								onClick: () => ignore(offer),
							},
						],
					},
				}),
			);
		}
	}, [offers, accept, ignore]);

	const value = useMemo<SharedToolsContextType>(
		() => ({
			offers,
			pendingCount: offers.filter((offer) => offer.status === 'new').length,
			accept,
			ignore,
			sharedByMe,
			globallySharedTools,
			projectUsedTools,
			projectAdditionalTools,
			projectShareEnabled,
			setProjectShareEnabled: (enabled) =>
				preferences.setShareProjectTools(projectKey, enabled),
		}),
		[
			offers,
			accept,
			ignore,
			sharedByMe,
			globallySharedTools,
			projectUsedTools,
			projectAdditionalTools,
			projectShareEnabled,
			preferences.setShareProjectTools,
			projectKey,
		],
	);

	return (
		<SharedToolsContext.Provider value={value}>
			{children}
		</SharedToolsContext.Provider>
	);
};
