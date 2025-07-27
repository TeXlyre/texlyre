// src/contexts/PropertiesContext.tsx
import type React from "react";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

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
	getProperty: (id: string, options?: {
		scope?: "global" | "project";
		projectId?: string;
	}) => unknown;
	setProperty: (id: string, value: unknown, options?: {
		scope?: "global" | "project";
		projectId?: string;
	}) => void;
	registerProperty: (property: Property) => void;
	unregisterProperty: (id: string) => void;
	getPropertiesByCategory: (
		category: string,
		subcategory?: string,
	) => Property[];
	hasProperty: (id: string, options?: {
		scope?: "global" | "project";
		projectId?: string;
	}) => boolean;
	getPropertyMetadata: (id: string, options?: {
		scope?: "global" | "project";
		projectId?: string;
	}) => Record<string, any> | null;
	clearAllProperties: (pluginId?: string) => void;
}

export const PropertiesContext = createContext<PropertiesContextType>({
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
	const localStoragePropertiesRef = useRef<Record<string, unknown> | null>(
		null,
	);
	const isLocalStorageLoaded = useRef(false);

	const getCurrentUserId = useCallback((): string | null => {
		return localStorage.getItem("texlyre-current-user");
	}, []);

	const getStorageKey = useCallback((): string => {
		const userId = getCurrentUserId();
		return userId ? `texlyre-user-${userId}-properties` : "texlyre-properties";
	}, [getCurrentUserId]);

	const getPropertyId = useCallback((
		id: string,
		scope: "global" | "project" = "global",
		projectId?: string,
	): string => {
		return scope === "project" && projectId
			? `${id}:${scope}:${projectId}`
			: `${id}:${scope}`;
	}, []);

	useEffect(() => {
		const userId = getCurrentUserId();
		const userStorageKey = userId
			? `texlyre-user-${userId}-properties`
			: "texlyre-properties";
		const globalStorageKey = "texlyre-properties";

		try {
			let stored = localStorage.getItem(userStorageKey);

			if (userId && !stored) {
				const globalProperties = localStorage.getItem(globalStorageKey);
				if (globalProperties) {
					localStorage.setItem(userStorageKey, globalProperties);
					stored = globalProperties;
				}
			}

			if (stored) {
				localStoragePropertiesRef.current = JSON.parse(stored);
			} else {
				localStoragePropertiesRef.current = {};
			}
		} catch (err) {
			console.error(
				"Error parsing properties from localStorage on initial load:",
				err,
			);
			localStorage.removeItem(userStorageKey);
			localStoragePropertiesRef.current = {};
		} finally {
			isLocalStorageLoaded.current = true;
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
		if (properties.length === 0 || !isLocalStorageLoaded.current) return;
		const toSave = properties.reduce(
			(acc, p) => {
				acc[p.id] = p.value;
				return acc;
			},
			{} as Record<string, unknown>,
		);
		try {
			const storageKey = getStorageKey();
			localStorage.setItem(storageKey, JSON.stringify(toSave));
		} catch (error) {
			console.error("Error saving properties to localStorage:", error);
		}
	}, [properties, getStorageKey]);

	const getProperty = useCallback(
		(id: string, options?: {
			scope?: "global" | "project";
			projectId?: string;
		}): unknown => {
			const scope = options?.scope || "global";
			const propertyId = getPropertyId(id, scope, options?.projectId);
			const property = properties.find((p) => p.id === propertyId);
			return property?.value;
		},
		[properties, getPropertyId],
	);

	const setProperty = useCallback((id: string, value: unknown, options?: {
		scope?: "global" | "project";
		projectId?: string;
	}) => {
		const scope = options?.scope || "global";
		const propertyId = getPropertyId(id, scope, options?.projectId);

		setProperties((prev) =>
			prev.map((p) => {
				if (p.id !== propertyId) return p;
				return { ...p, value };
			}),
		);
	}, [getPropertyId]);

	const registerProperty = useCallback((property: Property) => {
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
	}, [loadStoredValue]);

	const unregisterProperty = useCallback((id: string) => {
		setProperties((prev) => prev.filter((p) => p.id !== id));
	}, []);

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
		(id: string, options?: {
			scope?: "global" | "project";
			projectId?: string;
		}): boolean => {
			const scope = options?.scope || "global";
			const propertyId = getPropertyId(id, scope, options?.projectId);
			return properties.some((p) => p.id === propertyId);
		},
		[properties, getPropertyId],
	);

	const getPropertyMetadata = useCallback(
		(id: string, options?: {
			scope?: "global" | "project";
			projectId?: string;
		}): Record<string, any> | null => {
			const scope = options?.scope || "global";
			const propertyId = getPropertyId(id, scope, options?.projectId);
			const property = properties.find((p) => p.id === propertyId);
			return property ? {
				defaultValue: property.defaultValue,
				category: property.category,
				subcategory: property.subcategory,
				options: property.options
			} : null;
		},
		[properties, getPropertyId],
	);

	const clearAllProperties = useCallback(
		(pluginId?: string): void => {
			if (pluginId) {
				setProperties((prev) => prev.filter((p) => !p.id.startsWith(`${pluginId}-`)));
			} else {
				setProperties([]);
			}
		},
		[],
	);

	return (
		<PropertiesContext.Provider
			value={{
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