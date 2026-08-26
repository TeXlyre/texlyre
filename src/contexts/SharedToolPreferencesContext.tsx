// src/contexts/SharedToolPreferencesContext.tsx
import type React from 'react';
import { createContext, useCallback, useMemo, type ReactNode } from 'react';

import { useSettings } from '../hooks/useSettings';
import type {
	SharedToolAdvertisement,
	SharedToolDecision,
	SharedToolKind,
	SharedToolOrigin,
	SharedToolPreferences,
} from '../types/sharedTools';
import {
	SHARED_TOOL_PREFERENCES_SETTING,
	localSharedToolKey,
	normalizeSharedToolPreferences,
	sharedToolIdentity,
} from '../utils/sharedToolsUtils';

interface SharedToolPreferencesContextType {
	preferences: SharedToolPreferences;
	isSharedWithAll: (kind: SharedToolKind, id: string) => boolean;
	setSharedWithAll: (
		kind: SharedToolKind,
		id: string,
		enabled: boolean,
	) => void;
	isShareProjectTools: (projectKey: string) => boolean;
	setShareProjectTools: (projectKey: string, enabled: boolean) => void;
	getOrigin: (kind: SharedToolKind, id: string) => SharedToolOrigin | undefined;
	getDecision: (identity: string) => SharedToolDecision | undefined;
	recordAccepted: (
		kind: SharedToolKind,
		advertisement: SharedToolAdvertisement,
		localId: string,
		imported: boolean,
	) => void;
	recordIgnored: (identity: string, revision: string) => void;
	detachLocalTool: (kind: SharedToolKind, id: string) => void;
}

export const SharedToolPreferencesContext =
	createContext<SharedToolPreferencesContextType | null>(null);

interface SharedToolPreferencesProviderProps {
	children: ReactNode;
}

export const SharedToolPreferencesProvider: React.FC<
	SharedToolPreferencesProviderProps
> = ({ children }) => {
	const { getSetting, updateSetting } = useSettings();
	const settingValue = getSetting(SHARED_TOOL_PREFERENCES_SETTING)?.value;
	const preferences = useMemo(
		() => normalizeSharedToolPreferences(settingValue),
		[settingValue],
	);

	const commit = useCallback(
		(update: (current: SharedToolPreferences) => SharedToolPreferences) => {
			const current = normalizeSharedToolPreferences(
				getSetting(SHARED_TOOL_PREFERENCES_SETTING)?.value,
			);
			updateSetting(SHARED_TOOL_PREFERENCES_SETTING, update(current));
		},
		[getSetting, updateSetting],
	);

	const setSharedWithAll = useCallback(
		(kind: SharedToolKind, id: string, enabled: boolean) => {
			commit((current) => {
				const key = localSharedToolKey(kind, id);
				const shareWithAll = { ...current.shareWithAll };
				if (enabled) shareWithAll[key] = true;
				else delete shareWithAll[key];
				return { ...current, shareWithAll };
			});
		},
		[commit],
	);

	const setShareProjectTools = useCallback(
		(projectKey: string, enabled: boolean) => {
			commit((current) => {
				const shareProjectTools = { ...current.shareProjectTools };
				if (enabled) shareProjectTools[projectKey] = true;
				else delete shareProjectTools[projectKey];
				return { ...current, shareProjectTools };
			});
		},
		[commit],
	);

	const recordAccepted = useCallback(
		(
			kind: SharedToolKind,
			advertisement: SharedToolAdvertisement,
			localId: string,
			imported: boolean,
		) => {
			commit((current) => {
				const identity = sharedToolIdentity(
					kind,
					advertisement.ownerId,
					advertisement.toolId,
				);
				const decisions = {
					...current.decisions,
					[identity]: {
						decision: 'accepted' as const,
						revision: advertisement.revision,
						localId,
						imported,
					},
				};
				const origins = { ...current.origins };
				if (imported) {
					origins[localSharedToolKey(kind, localId)] = {
						ownerId: advertisement.ownerId,
						ownerName: advertisement.ownerName,
						toolId: advertisement.toolId,
					};
				}
				return { ...current, decisions, origins };
			});
		},
		[commit],
	);

	const recordIgnored = useCallback(
		(identity: string, revision: string) => {
			commit((current) => {
				const previous = current.decisions[identity];
				const shareWithAll = { ...current.shareWithAll };
				const origins = { ...current.origins };

				if (previous?.imported && previous.localId) {
					for (const kind of ['typesetter', 'lsp'] as const) {
						const key = localSharedToolKey(kind, previous.localId);
						const origin = origins[key];
						if (
							origin &&
							sharedToolIdentity(kind, origin.ownerId, origin.toolId) ===
								identity
						) {
							delete origins[key];
							delete shareWithAll[key];
						}
					}
				}

				return {
					...current,
					shareWithAll,
					origins,
					decisions: {
						...current.decisions,
						[identity]: { decision: 'ignored', revision },
					},
				};
			});
		},
		[commit],
	);

	const detachLocalTool = useCallback(
		(kind: SharedToolKind, id: string) => {
			commit((current) => {
				const key = localSharedToolKey(kind, id);
				const origin = current.origins[key];
				const shareWithAll = { ...current.shareWithAll };
				const origins = { ...current.origins };
				const decisions = { ...current.decisions };
				delete shareWithAll[key];
				delete origins[key];

				if (origin) {
					const identity = sharedToolIdentity(
						kind,
						origin.ownerId,
						origin.toolId,
					);
					const previous = decisions[identity];
					if (previous) {
						decisions[identity] = {
							decision: 'ignored',
							revision: previous.revision,
						};
					}
				}

				return { ...current, shareWithAll, origins, decisions };
			});
		},
		[commit],
	);

	const value = useMemo<SharedToolPreferencesContextType>(
		() => ({
			preferences,
			isSharedWithAll: (kind, id) =>
				preferences.shareWithAll[localSharedToolKey(kind, id)] === true,
			setSharedWithAll,
			isShareProjectTools: (projectKey) =>
				preferences.shareProjectTools[projectKey] === true,
			setShareProjectTools,
			getOrigin: (kind, id) =>
				preferences.origins[localSharedToolKey(kind, id)],
			getDecision: (identity) => preferences.decisions[identity],
			recordAccepted,
			recordIgnored,
			detachLocalTool,
		}),
		[
			preferences,
			setSharedWithAll,
			setShareProjectTools,
			recordAccepted,
			recordIgnored,
			detachLocalTool,
		],
	);

	return (
		<SharedToolPreferencesContext.Provider value={value}>
			{children}
		</SharedToolPreferencesContext.Provider>
	);
};
