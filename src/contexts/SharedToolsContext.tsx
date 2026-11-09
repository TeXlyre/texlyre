// src/contexts/SharedToolsContext.tsx
import type React from 'react';
import { nanoid } from 'nanoid';
import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';

import { t } from '@/i18n';
import { useACPConfig } from '../hooks/useACPConfig';
import { useAuth } from '../hooks/useAuth';
import { useChelys } from '../hooks/useChelys';
import { useCollab } from '../hooks/useCollab';
import { useLSPConfig } from '../hooks/useLSPConfig';
import { useSharedToolPreferences } from '../hooks/useSharedToolPreferences';
import { useSecrets } from '../hooks/useSecrets';
import { useStorageConfig } from '../hooks/useStorageConfig';
import { useTypesetterConfig } from '../hooks/useTypesetterConfig';
import type { TypesetterServerConfig } from '../services/GenericTypesetterService';
import { storageSyncService } from '../services/StorageSyncService';
import { typesetterRegistryService } from '../services/TypesetterRegistryService';
import type { DocumentList } from '../types/documents';
import type { LSPConfigBlock } from '../types/lsp';
import type { StorageConfigBlock } from '../types/storage';
import type {
	ObservedSharedTool,
	SharedAgent,
	SharedByMeTool,
	SharedLocalTool,
	SharedToolKind,
	SharedToolOffer,
} from '../types/sharedTools';
import type { ToolConfigBlock } from '../types/toolConfig';
import {
	SHARED_TOOLS_AWARENESS_FIELD,
	SHARED_PROJECT_AGENTS_MAP,
	buildSharedToolAdvertisement,
	classifySharedToolConflict,
	findTrustedSharedStorage,
	describeSharedToolAvailability,
	localSharedToolKey,
	projectSharingKey,
	readProjectSharedAgents,
	readSharedToolsFromAwareness,
	selectAdvertisedTools,
	sharedAgentId,
	sharedToolIdentity,
	syncProjectSharedAgents,
} from '../utils/sharedToolsUtils';
import {
	hostStorageProjectKeySharing,
	requestStorageProjectKey,
} from '../utils/storageKeyShareUtils';

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
	// This user's agents and whether each is shared in this project.
	projectAgents: SharedLocalTool[];
	setAgentShared: (agentId: string, enabled: boolean) => void;
	// Collaborators' accepted agent links persisted in this project.
	sharedAgents: SharedAgent[];
	storageShareAvailable: boolean;
	storageShareEnabled: boolean;
	storageShareable: boolean;
	storageShareMessage?: string;
	setStorageShareEnabled: (enabled: boolean) => void;
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
	const { storageUnlocked, unlockStorage } = useChelys();
	const { promptForPassword } = useSecrets();
	const { data: doc, doc: ydoc, provider } = useCollab<DocumentList>();
	const typesetters = useTypesetterConfig();
	const lsps = useLSPConfig();
	const storages = useStorageConfig();
	const acps = useACPConfig();
	const preferences = useSharedToolPreferences();
	const [awarenessTools, setAwarenessTools] = useState<ObservedSharedTool[]>(
		[],
	);
	const [projectSharedAgents, setProjectSharedAgents] = useState<
		ObservedSharedTool[]
	>([]);
	const observed = useMemo(
		() => [...awarenessTools, ...projectSharedAgents],
		[awarenessTools, projectSharedAgents],
	);
	const [, setStorageBindingRevision] = useState(0);
	const notifiedRef = useRef(new Set<string>());
	const acceptingStorageRef = useRef(new Set<string>());
	const projectKey = projectSharingKey(docUrl);
	const currentProjectId = projectKey.startsWith('yjs:')
		? projectKey.slice(4)
		: projectKey;
	const storageBinding = user?.id
		? storageSyncService.getProjectBinding(user.id, currentProjectId)
		: null;

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
			projectShared?: boolean,
			storage?: SharedLocalTool['storage'],
		): SharedLocalTool => {
			const share = describeSharedToolAvailability(config);
			return {
				kind,
				config,
				shareable: share.shareable,
				shareMessage: share.message,
				// Agents are shared one by one per project, never with everyone.
				sharedWithAll:
					kind !== 'storage' &&
					kind !== 'agent' &&
					preferences.isSharedWithAll(kind, config.id),
				usedByProject,
				...(projectShared !== undefined ? { projectShared } : {}),
				...(storage ? { storage } : {}),
				sharedInProject:
					kind === 'agent' &&
					preferences.isAgentSharedInProject(projectKey, config.id),
			};
		};

		const storageConfig =
			storageBinding?.enabled === true
				? storages.configs.find(
						(config) =>
							config.id === storageBinding.providerId && config.enabled,
					)
				: undefined;

		return uniqueTools([
			...typesetters.configs
				.filter((config) => config.enabled)
				.map((config) =>
					makeTool('typesetter', config, config.id === usedTypesetterId),
				),
			...lsps.configs
				.filter((config) => config.enabled)
				.map((config) => makeTool('lsp', config, usedLspIds.has(config.id))),
			...(storageConfig && storageBinding
				? [
						makeTool(
							'storage',
							storageConfig,
							true,
							storageBinding.shareWithCollaborators === true,
							{
								storageProjectId: storageBinding.storageProjectId,
								...(storageBinding.baseRevision
									? { baseRevision: storageBinding.baseRevision }
									: {}),
							},
						),
					]
				: []),
			...acps.configs
				.filter((config) => config.enabled)
				.map((config) => makeTool('agent', config, false)),
		]);
	}, [
		doc?.documents,
		doc?.projectMetadata?.compilerId,
		doc?.projectMetadata?.type,
		typesetters.configs,
		lsps.configs,
		lsps.getConfigsForFile,
		storages.configs,
		storageBinding,
		acps.configs,
		preferences.isSharedWithAll,
		preferences.isAgentSharedInProject,
		projectKey,
	]);

	const projectShareEnabled = preferences.isShareProjectTools(projectKey);
	const globallySharedTools = tools.filter(
		(tool) => tool.sharedWithAll && tool.shareable,
	);
	const projectUsedTools = tools.filter((tool) => tool.usedByProject);
	const projectAdditionalTools = projectUsedTools.filter(
		(tool) => !tool.sharedWithAll,
	);
	const projectAgents = tools.filter((tool) => tool.kind === 'agent');
	const advertisedTools = selectAdvertisedTools(tools, projectShareEnabled);
	const sharedByMe: SharedByMeTool[] = advertisedTools.map((tool) => ({
		...tool,
		scope: tool.sharedWithAll ? 'all' : 'project',
	}));

	const localConfigs = useCallback(
		(kind: SharedToolKind): ToolConfigBlock[] => {
			if (kind === 'typesetter') {
				return [...typesetters.configs, ...typesetters.disabledConfigs];
			}
			if (kind === 'lsp') {
				return [...lsps.configs, ...lsps.disabledConfigs];
			}
			if (kind === 'storage') {
				return [...storages.configs, ...storages.disabledConfigs];
			}
			// Shared agents are never copied in, so they can't conflict.
			return [];
		},
		[
			typesetters.configs,
			typesetters.disabledConfigs,
			lsps.configs,
			lsps.disabledConfigs,
			storages.configs,
			storages.disabledConfigs,
		],
	);

	const addConfig = useCallback(
		(kind: SharedToolKind, config: ToolConfigBlock) => {
			if (kind === 'typesetter') {
				typesetters.addConfigs([config as TypesetterServerConfig]);
			} else if (kind === 'lsp') {
				lsps.addConfigs([config as LSPConfigBlock]);
			} else if (kind === 'storage') {
				storages.addConfigs([config as StorageConfigBlock]);
			}
		},
		[typesetters.addConfigs, lsps.addConfigs, storages.addConfigs],
	);

	const removeConfig = useCallback(
		(kind: SharedToolKind, id: string) => {
			if (kind === 'typesetter') typesetters.removeConfig(id);
			else if (kind === 'lsp') lsps.removeConfig(id);
			else if (kind === 'storage') storages.removeConfig(id);
		},
		[typesetters.removeConfig, lsps.removeConfig, storages.removeConfig],
	);

	useEffect(() => {
		const awareness = provider?.awareness;
		if (!awareness || !user?.id) return;

		const owner = { id: user.id, name: user.name || user.username };
		const advertisements = advertisedTools
			.filter((tool) => tool.kind !== 'agent')
			.map((tool) =>
				buildSharedToolAdvertisement(
					tool.kind,
					tool.config,
					owner,
					preferences.getOrigin(tool.kind, tool.config.id),
					tool.storage,
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
		preferences.getOrigin,
	]);

	useEffect(() => {
		const awareness = provider?.awareness;
		if (!awareness) {
			setAwarenessTools([]);
			return;
		}

		const update = () =>
			setAwarenessTools(readSharedToolsFromAwareness(awareness, user?.id));
		awareness.on('change', update);
		update();
		return () => awareness.off('change', update);
	}, [provider?.awareness, user?.id]);

	// Unlike presence-based tool offers, agent links remain in the project CRDT
	// after the owner's browser leaves. Each client manages its own links; the collaborator opens the
	// advertised endpoint directly.
	useEffect(() => {
		if (!ydoc || !user?.id) return;
		const map = ydoc.getMap<unknown>(SHARED_PROJECT_AGENTS_MAP);
		const advertisements = advertisedTools
			.filter((tool) => tool.kind === 'agent')
			.map((tool) =>
				buildSharedToolAdvertisement('agent', tool.config, {
					id: user.id,
					name: user.name || user.username,
				}),
			);
		const publish = () => syncProjectSharedAgents(map, user.id, advertisements);
		map.observe(publish);
		publish();
		return () => map.unobserve(publish);
	}, [ydoc, user?.id, user?.name, user?.username, advertisedTools]);

	useEffect(() => {
		if (!ydoc) {
			setProjectSharedAgents([]);
			return;
		}
		const map = ydoc.getMap<unknown>(SHARED_PROJECT_AGENTS_MAP);
		const read = () =>
			setProjectSharedAgents(readProjectSharedAgents(map, user?.id));
		map.observe(read);
		read();
		return () => map.unobserve(read);
	}, [ydoc, user?.id]);

	useEffect(() => {
		if (
			!provider ||
			!user?.id ||
			!currentProjectId ||
			!storageBinding?.enabled ||
			storageBinding.shareWithCollaborators !== true
		) {
			return;
		}

		return hostStorageProjectKeySharing(
			provider,
			storageBinding.storageProjectId,
			() =>
				storageSyncService.exportProjectKeyForSharing(
					user.id,
					currentProjectId,
				),
		);
	}, [
		provider,
		user?.id,
		currentProjectId,
		storageBinding?.enabled,
		storageBinding?.shareWithCollaborators,
		storageBinding?.storageProjectId,
	]);

	const offers = useMemo<SharedToolOffer[]>(
		() =>
			observed.map((tool) => {
				const identity = sharedToolIdentity(
					tool.kind,
					tool.ownerId,
					tool.toolId,
					tool.storage?.storageProjectId,
				);
				const conflict = classifySharedToolConflict(
					tool,
					localConfigs(tool.kind),
				);
				const decision = preferences.getDecision(identity);
				const trustedStorage =
					tool.kind === 'storage'
						? findTrustedSharedStorage(
								tool,
								[...storages.configs, ...storages.disabledConfigs],
								preferences.preferences,
							)
						: undefined;
				const localId =
					trustedStorage?.id ?? decision?.localId ?? conflict.localId;

				if (
					tool.kind !== 'storage' &&
					conflict.kind === 'same-id-same-config' &&
					!decision
				) {
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
				if (
					tool.kind === 'storage' &&
					storageBinding &&
					(storageBinding.storageProjectId !== tool.storage?.storageProjectId ||
						storageBinding.providerId !== localId)
				) {
					return { ...tool, identity, conflict, status: 'ignored', localId };
				}
				if (decision?.decision === 'accepted') {
					if (tool.kind !== 'storage') {
						return { ...tool, identity, conflict, status: 'accepted', localId };
					}
					const binding = storageBinding;
					if (
						binding &&
						binding.providerId === decision.localId &&
						binding.storageProjectId === tool.storage?.storageProjectId &&
						storages.configs.some((config) => config.id === decision.localId)
					) {
						return { ...tool, identity, conflict, status: 'accepted', localId };
					}
				}
				return { ...tool, identity, conflict, status: 'new', localId };
			}),
		[
			observed,
			localConfigs,
			preferences.getDecision,
			preferences.preferences,
			storages.configs,
			storages.disabledConfigs,
			storageBinding,
		],
	);

	const accept = useCallback(
		(offer: SharedToolOffer) => {
			// An agent is used while its owner shares it, not copied into the
			// user's own agents.
			if (offer.kind === 'agent') {
				preferences.recordAccepted(offer.kind, offer, offer.toolId, false);
				dismissToast(offer.identity);
				return;
			}

			if (offer.kind !== 'storage') {
				const sameExisting = offer.conflict.kind === 'same-id-same-config';
				if (!sameExisting) addConfig(offer.kind, offer.config);
				preferences.recordAccepted(
					offer.kind,
					offer,
					offer.toolId,
					!sameExisting,
				);
				dismissToast(offer.identity);
				return;
			}

			const attachment = offer.storage;
			if (
				!user?.id ||
				!currentProjectId ||
				!attachment ||
				!provider ||
				acceptingStorageRef.current.size > 0
			) {
				return;
			}

			acceptingStorageRef.current.add(offer.identity);
			void (async () => {
				let attached = false;
				let importedId: string | null = null;
				try {
					if (!storageUnlocked) {
						const password = await promptForPassword(
							t('Enter your TeXlyre password to unlock encrypted storage:'),
						);
						if (!password) return;
						await unlockStorage(password);
					}

					const trusted = findTrustedSharedStorage(
						offer,
						[...storages.configs, ...storages.disabledConfigs],
						preferences.preferences,
					);
					const existingOrigin = preferences.getOrigin('storage', offer.toolId);
					const existing =
						offer.conflict.kind === 'same-id-same-config' &&
						storages.configs.some(
							(config) => config.id === offer.toolId && config.enabled,
						) &&
						(!existingOrigin ||
							(existingOrigin.ownerId === offer.ownerId &&
								existingOrigin.toolId === offer.toolId));
					const knownConfigs = [
						...storages.configs,
						...storages.disabledConfigs,
					];
					const previousBinding = storageSyncService.getProjectBinding(
						user.id,
						currentProjectId,
					);
					// Recover a dangling binding left when its shared recipe was removed.
					const recoverId =
						previousBinding?.storageProjectId === attachment.storageProjectId &&
						!knownConfigs.some(
							(config) => config.id === previousBinding.providerId,
						)
							? previousBinding.providerId
							: undefined;
					const idTaken = knownConfigs.some(
						(config) => config.id === offer.toolId,
					);
					const localId =
						trusted?.id ??
						recoverId ??
						(existing || !idTaken ? offer.toolId : nanoid());
					const origin = preferences.getOrigin('storage', localId);
					const managed =
						(!existing && !trusted) ||
						(origin?.ownerId === offer.ownerId &&
							origin.toolId === offer.toolId);
					if (
						previousBinding &&
						(previousBinding.providerId !== localId ||
							previousBinding.storageProjectId !== attachment.storageProjectId)
					) {
						return; // Never replace an existing project's storage.
					}
					const projectKey = await requestStorageProjectKey(
						provider,
						attachment.storageProjectId,
					);
					if (!trusted && !existing) {
						addConfig('storage', {
							...offer.config,
							id: localId,
							...(localId !== offer.toolId
								? { transportId: offer.toolId }
								: {}),
						} as StorageConfigBlock);
						importedId = localId;
					}
					storageSyncService.attachSharedProject(
						user.id,
						currentProjectId,
						localId,
						attachment.storageProjectId,
						attachment.baseRevision,
					);
					attached = !previousBinding;
					await storageSyncService.storeSharedProjectKey(
						user.id,
						currentProjectId,
						projectKey,
					);
					preferences.recordAccepted('storage', offer, localId, managed);
					setStorageBindingRevision((revision) => revision + 1);
					dismissToast(offer.identity);
				} catch (error) {
					if (attached) {
						storageSyncService.disconnectProject(user.id, currentProjectId);
					}
					if (importedId) removeConfig('storage', importedId);
					document.dispatchEvent(
						new CustomEvent('toast-notification', {
							detail: {
								type: 'error',
								message:
									error instanceof Error
										? error.message
										: 'Unable to receive shared storage key',
							},
						}),
					);
				} finally {
					acceptingStorageRef.current.delete(offer.identity);
				}
			})();
		},
		[
			addConfig,
			removeConfig,
			preferences.recordAccepted,
			preferences.getOrigin,
			preferences.preferences,
			storages.configs,
			storages.disabledConfigs,
			provider,
			user?.id,
			currentProjectId,
			storageUnlocked,
			promptForPassword,
			unlockStorage,
		],
	);

	useEffect(() => {
		if (!storageUnlocked || storageBinding || acceptingStorageRef.current.size)
			return;
		const matching = offers.find(
			(offer) =>
				offer.kind === 'storage' &&
				offer.status === 'new' &&
				Boolean(
					findTrustedSharedStorage(
						offer,
						[...storages.configs, ...storages.disabledConfigs],
						preferences.preferences,
					),
				),
		);
		if (matching) accept(matching);
	}, [
		offers,
		accept,
		storageUnlocked,
		storageBinding,
		storages.configs,
		storages.disabledConfigs,
		preferences.preferences,
	]);

	const ignore = useCallback(
		(offer: SharedToolOffer) => {
			const previous = preferences.getDecision(offer.identity);
			if (
				offer.kind === 'storage' &&
				previous?.decision === 'accepted' &&
				user?.id &&
				currentProjectId
			) {
				const binding = storageSyncService.getProjectBinding(
					user.id,
					currentProjectId,
				);
				if (
					binding &&
					binding.providerId === previous.localId &&
					(!offer.storage ||
						binding.storageProjectId === offer.storage.storageProjectId)
				) {
					storageSyncService.disconnectProject(user.id, currentProjectId);
					setStorageBindingRevision((revision) => revision + 1);
				}
			}
			if (
				previous?.decision === 'accepted' &&
				previous.imported &&
				previous.localId
			) {
				const origin = preferences.getOrigin(offer.kind, previous.localId);
				const storageStillUsed =
					offer.kind === 'storage' &&
					user?.id &&
					Object.values(storageSyncService.getProjectBindings(user.id)).some(
						(binding) => binding.providerId === previous.localId,
					);
				if (
					origin?.ownerId === offer.ownerId &&
					origin.toolId === offer.toolId &&
					!storageStillUsed
				) {
					if (offer.kind === 'storage') {
						preferences.detachLocalTool('storage', previous.localId);
					}
					removeConfig(offer.kind, previous.localId);
				}
			}
			preferences.recordIgnored(offer.identity, offer.revision);
			dismissToast(offer.identity);
		},
		[
			preferences.getDecision,
			preferences.getOrigin,
			preferences.detachLocalTool,
			preferences.recordIgnored,
			removeConfig,
			user?.id,
			currentProjectId,
		],
	);

	useEffect(() => {
		for (const offer of offers) {
			const decision = preferences.getDecision(offer.identity);
			if (
				offer.kind !== 'storage' &&
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

			if (
				storageUnlocked &&
				offer.kind === 'storage' &&
				findTrustedSharedStorage(
					offer,
					[...storages.configs, ...storages.disabledConfigs],
					preferences.preferences,
				)
			)
				continue;
			const sameName =
				offer.kind !== 'storage' && offer.conflict.kind === 'same-name';
			const sameIdConflict =
				offer.kind !== 'storage' &&
				offer.conflict.kind === 'same-id-different-config';
			document.dispatchEvent(
				new CustomEvent('toast-notification', {
					detail: {
						type: 'info',
						message:
							offer.kind === 'agent'
								? `${offer.ownerName} is sharing the agent ${offer.name}. It connects directly to their Chelys host.`
								: sameIdConflict
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
									: sameName ||
											(offer.kind === 'storage' &&
												offer.conflict.kind !== 'none')
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
	}, [
		offers,
		accept,
		ignore,
		storageUnlocked,
		storages.configs,
		storages.disabledConfigs,
		preferences.preferences,
	]);

	const storageTool = tools.find((tool) => tool.kind === 'storage');
	const storageShareAvailable = Boolean(storageBinding && storageTool);
	const storageShareEnabled = storageBinding?.shareWithCollaborators === true;
	const storageShareable = storageTool?.shareable === true;
	const storageShareMessage = storageTool?.shareMessage;
	const setStorageShareEnabled = useCallback(
		(enabled: boolean) => {
			if (!user?.id || !currentProjectId || !storageBinding) return;
			if (enabled && !storageShareable) return;
			storageSyncService.setShareWithCollaborators(
				user.id,
				currentProjectId,
				enabled,
			);
			setStorageBindingRevision((revision) => revision + 1);
		},
		[user?.id, currentProjectId, storageBinding, storageShareable],
	);

	const sharedAgents = useMemo<SharedAgent[]>(
		() =>
			offers
				.filter(
					(offer) => offer.kind === 'agent' && offer.status === 'accepted',
				)
				.map((offer) => ({
					identity: offer.identity,
					ownerId: offer.ownerId,
					ownerName: offer.ownerName,
					config: {
						...(offer.config as SharedAgent['config']),
						id: sharedAgentId(offer.identity),
						transportId: offer.toolId,
					},
				})),
		[offers],
	);

	const setAgentShared = useCallback(
		(agentId: string, enabled: boolean) =>
			preferences.setAgentSharedInProject(projectKey, agentId, enabled),
		[preferences.setAgentSharedInProject, projectKey],
	);

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
			projectAgents,
			setAgentShared,
			sharedAgents,
			storageShareAvailable,
			storageShareEnabled,
			storageShareable,
			storageShareMessage,
			setStorageShareEnabled,
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
			projectAgents,
			setAgentShared,
			sharedAgents,
			storageShareAvailable,
			storageShareEnabled,
			storageShareable,
			storageShareMessage,
			setStorageShareEnabled,
		],
	);

	return (
		<SharedToolsContext.Provider value={value}>
			{children}
		</SharedToolsContext.Provider>
	);
};
