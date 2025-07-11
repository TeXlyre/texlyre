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
}

export interface PropertiesContextType {
	getProperty: (id: string) => unknown;
	setProperty: (id: string, value: unknown) => void;
	registerProperty: (property: Property) => void;
	unregisterProperty: (id: string) => void;
	getPropertiesByCategory: (
		category: string,
		subcategory?: string,
	) => Property[];
}

export const PropertiesContext = createContext<PropertiesContextType>({
	getProperty: () => undefined,
	setProperty: () => {},
	registerProperty: () => {},
	unregisterProperty: () => {},
	getPropertiesByCategory: () => [],
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

	const loadStoredValue = (property: Property): unknown => {
		if (
			localStoragePropertiesRef.current &&
			localStoragePropertiesRef.current[property.id] !== undefined
		) {
			return localStoragePropertiesRef.current[property.id];
		}
		return property.defaultValue;
	};

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
		(id: string): unknown => {
			const property = properties.find((p) => p.id === id);
			return property?.value;
		},
		[properties],
	);

	const setProperty = useCallback((id: string, value: unknown) => {
		setProperties((prev) =>
			prev.map((p) => {
				if (p.id !== id) return p;
				return { ...p, value };
			}),
		);
	}, []);

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
	}, []);

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

	return (
		<PropertiesContext.Provider
			value={{
				getProperty,
				setProperty,
				registerProperty,
				unregisterProperty,
				getPropertiesByCategory,
			}}
		>
			{children}
		</PropertiesContext.Provider>
	);
};
