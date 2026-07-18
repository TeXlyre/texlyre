// src/contexts/PropertiesContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

export interface Property {
	id: string;
	category: string;
	subcategory?: string;
	defaultValue: unknown;
	value?: unknown;
	options?: Array<{ label: string; value: string | number | boolean }>;
	onChange?: (value: unknown) => void;
}

export interface PropertiesContextType {
	isReady: boolean;
	getProperty: (
		id: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string;
		},
	) => unknown;
	setProperty: (
		id: string,
		value: unknown,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string;
		},
	) => void;
	registerProperty: (property: Property) => void;
	unregisterProperty: (
		id: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string;
		},
	) => void;
	getPropertiesByCategory: (
		category: string,
		subcategory?: string,
	) => Property[];
	hasProperty: (
		id: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string;
		},
	) => boolean;
	getPropertyMetadata: (
		id: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string;
		},
	) => Record<string, any> | null;
	clearAllProperties: (pluginId?: string) => void;
}

const isEqual = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

export const PropertiesContext = createContext<PropertiesContextType>({
	isReady: false,
	getProperty: () => undefined,
	setProperty: () => {},
	registerProperty: () => {},
	unregisterProperty: () => {},
	getPropertiesByCategory: () => [],
	hasProperty: () => false,
	getPropertyMetadata: () => null,
	clearAllProperties: () => {},
});

interface PropertiesProviderProps {
	children: ReactNode;
}

export const PropertiesProvider: React.FC<PropertiesProviderProps> = ({
	children,
}) => {
	const [properties, setProperties] = useState<Property[]>([]);
	const [isReady, setIsReady] = useState(false);
	const localStoragePropertiesRef = useRef<Record<string, unknown> | null>(
		null,
	);
	const hasInitializedSaveRef = useRef(false);

	const getCurrentUserId = useCallback((): string | null => {
		return localStorage.getItem('texlyre-current-user');
	}, []);

	const getStorageKey = useCallback((): string => {
		const userId = getCurrentUserId();
		return userId ? `texlyre-user-${userId}-properties` : 'texlyre-properties';
	}, [getCurrentUserId]);

	const getPropertyId = useCallback(
		(
			id: string,
			scope: 'global' | 'project' = 'global',
			projectId?: string,
		): string => {
			if (scope === 'project' && projectId) {
				return `${id}:project:${projectId}`;
			}
			return `${id}:global`;
		},
		[],
	);

	useEffect(() => {
		const userId = getCurrentUserId();
		const userStorageKey = userId
			? `texlyre-user-${userId}-properties`
			: 'texlyre-properties';
		const globalStorageKey = 'texlyre-properties';

		try {
			const globalProperties = localStorage.getItem(globalStorageKey);
			const globalPropertiesParsed = globalProperties
				? JSON.parse(globalProperties)
				: {};
			const globalVersion = globalPropertiesParsed._version;

			let stored = localStorage.getItem(userStorageKey);
			let storedParsed = stored ? JSON.parse(stored) : null;

			if (
				userId &&
				(!storedParsed || storedParsed._version !== globalVersion)
			) {
				if (globalProperties) {
					localStorage.setItem(userStorageKey, globalProperties);
					stored = globalProperties;
					storedParsed = globalPropertiesParsed;
				}
			}

			if (storedParsed) {
				const { _version, ...propertiesWithoutVersion } = storedParsed;
				localStoragePropertiesRef.current = propertiesWithoutVersion;
			} else {
				localStoragePropertiesRef.current = {};
			}
		} catch (error) {
			console.error(
				'[PropertiesContext] Error parsing properties from localStorage on initial load:',
				error,
			);
			localStorage.removeItem(userStorageKey);
			localStoragePropertiesRef.current = {};
		} finally {
			setIsReady(true);
		}
	}, [getCurrentUserId]);

	const loadStoredValue = useCallback((property: Property): unknown => {
		if (
			localStoragePropertiesRef.current &&
			localStoragePropertiesRef.current[property.id] !== undefined
		) {
			return localStoragePropertiesRef.current[property.id];
		}
		return property.defaultValue;
	}, []);

	useEffect(() => {
		if (!isReady) return;
		if (!hasInitializedSaveRef.current) {
			hasInitializedSaveRef.current = true;
			return;
		}
		if (properties.length === 0) return;

		try {
			const storageKey = getStorageKey();
			const currentStored = localStorage.getItem(storageKey);
			const { _version, ...currentEntries } = currentStored
				? JSON.parse(currentStored)
				: {};

			const toSave: Record<string, unknown> = { ...currentEntries };
			properties.forEach((p) => {
				toSave[p.id] = p.value;
			});

			localStorage.setItem(storageKey, JSON.stringify({ ...toSave, _version }));
			localStoragePropertiesRef.current = toSave;
		} catch (error) {
			console.error(
				'[PropertiesContext] Error saving properties to localStorage:',
				error,
			);
		}
	}, [properties, getStorageKey, isReady]);

	useEffect(() => {
		const handleStoreChanged = (event: Event) => {
			const detail = (event as CustomEvent).detail;
			if (detail && detail.store !== 'properties') return;

			try {
				const stored = localStorage.getItem(getStorageKey());
				if (!stored) return;
				const { _version, ...entries } = JSON.parse(stored);
				localStoragePropertiesRef.current = entries;

				setProperties((prev) => {
					let changed = false;
					const next = prev.map((p) => {
						const incoming = entries[p.id];
						if (incoming === undefined || isEqual(incoming, p.value)) return p;
						changed = true;
						return { ...p, value: incoming };
					});
					return changed ? next : prev;
				});
			} catch (error) {
				console.error(
					'[PropertiesContext] Error applying synced properties:',
					error,
				);
			}
		};

		window.addEventListener('chelys-account-store-changed', handleStoreChanged);
		return () =>
			window.removeEventListener(
				'chelys-account-store-changed',
				handleStoreChanged,
			);
	}, [getStorageKey]);

	const getProperty = useCallback(
		(
			id: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string;
			},
		): unknown => {
			const scope = options?.scope || 'global';
			const propertyId = getPropertyId(id, scope, options?.projectId);

			if (
				localStoragePropertiesRef.current &&
				localStoragePropertiesRef.current[propertyId] !== undefined
			) {
				return localStoragePropertiesRef.current[propertyId];
			}

			const property = properties.find((p) => p.id === propertyId);
			return property?.value;
		},
		[properties, getPropertyId],
	);

	const setProperty = useCallback(
		(
			id: string,
			value: unknown,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string;
			},
		) => {
			const scope = options?.scope || 'global';
			const propertyId = getPropertyId(id, scope, options?.projectId);

			if (localStoragePropertiesRef.current) {
				localStoragePropertiesRef.current[propertyId] = value;
			}

			setProperties((prev) => {
				const existingIndex = prev.findIndex((p) => p.id === propertyId);
				if (existingIndex >= 0) {
					return prev.map((p) => {
						if (p.id !== propertyId) return p;
						return { ...p, value };
					});
				}

				const baseProperty = prev.find((p) => p.id === id);
				if (baseProperty) {
					return [...prev, { ...baseProperty, id: propertyId, value }];
				}

				return prev;
			});

			try {
				const storageKey = getStorageKey();
				const currentStored = localStorage.getItem(storageKey);
				const currentVersion = currentStored
					? JSON.parse(currentStored)._version
					: undefined;

				localStorage.setItem(
					storageKey,
					JSON.stringify({
						...localStoragePropertiesRef.current,
						_version: currentVersion,
					}),
				);
			} catch (error) {
				console.error(
					'[PropertiesContext] Error saving property to localStorage:',
					error,
				);
			}
		},
		[getPropertyId, getStorageKey],
	);

	const registerProperty = useCallback(
		(property: Property) => {
			setProperties((prev) => {
				const idx = prev.findIndex((p) => p.id === property.id);
				let valueToUse: unknown;

				if (idx >= 0) {
					valueToUse = prev[idx].value;
				} else {
					valueToUse =
						property.value !== undefined
							? property.value
							: loadStoredValue(property);
				}

				const propertyWithValue = { ...property, value: valueToUse };

				if (idx >= 0) {
					const updated = [...prev];
					updated[idx] = propertyWithValue;
					return updated;
				}
				return [...prev, propertyWithValue];
			});
		},
		[loadStoredValue],
	);

	const unregisterProperty = useCallback(
		(
			id: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string;
			},
		) => {
			const propertyId = options
				? getPropertyId(id, options.scope || 'global', options.projectId)
				: id;

			if (localStoragePropertiesRef.current) {
				delete localStoragePropertiesRef.current[propertyId];
			}

			setProperties((prev) =>
				prev.filter((p) => p.id !== propertyId && p.id !== id),
			);

			try {
				const storageKey = getStorageKey();
				const currentStored = localStorage.getItem(storageKey);
				const currentVersion = currentStored
					? JSON.parse(currentStored)._version
					: undefined;

				localStorage.setItem(
					storageKey,
					JSON.stringify({
						...localStoragePropertiesRef.current,
						_version: currentVersion,
					}),
				);
			} catch (error) {
				console.error(
					'[PropertiesContext] Error removing property from localStorage:',
					error,
				);
			}
		},
		[getPropertyId, getStorageKey],
	);

	const getPropertiesByCategory = useCallback(
		(category: string, subcategory?: string) => {
			return properties.filter(
				(p) =>
					p.category === category &&
					(subcategory === undefined || p.subcategory === subcategory),
			);
		},
		[properties],
	);

	const hasProperty = useCallback(
		(
			id: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string;
			},
		): boolean => {
			const scope = options?.scope || 'global';
			const propertyId = getPropertyId(id, scope, options?.projectId);

			if (
				localStoragePropertiesRef.current &&
				localStoragePropertiesRef.current[propertyId] !== undefined
			) {
				return true;
			}

			return properties.some((p) => p.id === propertyId);
		},
		[properties, getPropertyId],
	);

	const getPropertyMetadata = useCallback(
		(
			id: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string;
			},
		): Record<string, any> | null => {
			const scope = options?.scope || 'global';
			const propertyId = getPropertyId(id, scope, options?.projectId);
			const property = properties.find((p) => p.id === propertyId);
			return property
				? {
						defaultValue: property.defaultValue,
						category: property.category,
						subcategory: property.subcategory,
						options: property.options,
					}
				: null;
		},
		[properties, getPropertyId],
	);

	const clearAllProperties = useCallback((pluginId?: string): void => {
		if (pluginId) {
			setProperties((prev) =>
				prev.filter((p) => !p.id.startsWith(`${pluginId}-`)),
			);
		} else {
			setProperties([]);
		}
	}, []);

	return (
		<PropertiesContext.Provider
			value={{
				isReady,
				getProperty,
				setProperty,
				registerProperty,
				unregisterProperty,
				getPropertiesByCategory,
				hasProperty,
				getPropertyMetadata,
				clearAllProperties,
			}}
		>
			{children}
		</PropertiesContext.Provider>
	);
};
