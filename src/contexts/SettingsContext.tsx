// src/contexts/SettingsContext.tsx
import type React from "react";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { pluginSettings } from "../plugins/PluginRegistry";

export type SettingType = "checkbox" | "select" | "text" | "number" | "color";

export interface SettingOption {
	label: string;
	value: string | number | boolean;
}

export interface Setting {
	id: string;
	category: string;
	subcategory?: string;
	type: SettingType;
	label: string;
	description?: string;
	defaultValue: unknown;
	value?: unknown;
	options?: SettingOption[];
	min?: number;
	max?: number;
	validate?: (value: unknown) => boolean;
	onChange?: (value: unknown) => void;
	strictDefaultValue?: boolean;
	liveUpdate?: boolean;
}

export interface SettingsContextType {
	getSettings: () => Setting[];
	getSetting: (id: string) => Setting | undefined;
	updateSetting: (id: string, value: unknown) => void;
	registerSetting: (setting: Setting) => void;
	unregisterSetting: (id: string) => void;
	getSettingsByCategory: (category: string, subcategory?: string) => Setting[];
	getCategories: () => { category: string; subcategories: string[] }[];
	commitSetting: (id: string) => void;
	searchSettings: (query: string) => {
		categories: { category: string; subcategories: string[] }[];
		allSettings: Setting[];
	};
	hasUnsavedChanges: boolean;
	needsRefresh: boolean;
}

export const SettingsContext = createContext<SettingsContextType>({
	getSettings: () => [],
	getSetting: () => undefined,
	updateSetting: () => {},
	registerSetting: () => {},
	unregisterSetting: () => {},
	getSettingsByCategory: () => [],
	getCategories: () => [],
	commitSetting: () => {},
	searchSettings: () => ({ categories: [], allSettings: [] }),
	hasUnsavedChanges: false,
	needsRefresh: false,
});

interface SettingsProviderProps {
	children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({
	children,
}) => {
	const [settings, setSettings] = useState<Setting[]>([]);
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [needsRefresh, setNeedsRefresh] = useState(false);
	const localStorageSettingsRef = useRef<Record<string, unknown> | null>(null);
	const isLocalStorageLoaded = useRef(false);

	const getCurrentUserId = useCallback((): string | null => {
		return localStorage.getItem("texlyre-current-user");
	}, []);

	const getStorageKey = useCallback((): string => {
		const userId = getCurrentUserId();
		return userId ? `texlyre-user-${userId}-settings` : "texlyre-settings";
	}, [getCurrentUserId]);

	useEffect(() => {
		const userId = getCurrentUserId();
		const userStorageKey = userId
			? `texlyre-user-${userId}-settings`
			: "texlyre-settings";
		const globalStorageKey = "texlyre-settings";

		try {
			// Try to load user-specific settings first
			let stored = localStorage.getItem(userStorageKey);

			// If user exists but no user-specific settings, check for global settings to migrate
			if (userId && !stored) {
				const globalSettings = localStorage.getItem(globalStorageKey);
				if (globalSettings) {
					// Duplicate global settings for this user
					localStorage.setItem(userStorageKey, globalSettings);
					stored = globalSettings;
				}
			}

			if (stored) {
				localStorageSettingsRef.current = JSON.parse(stored);
			} else {
				localStorageSettingsRef.current = {};
			}
		} catch (err) {
			console.error(
				"Error parsing settings from localStorage on initial load:",
				err,
			);
			localStorage.removeItem(userStorageKey);
			localStorageSettingsRef.current = {};
		} finally {
			isLocalStorageLoaded.current = true;
			pluginSettings.forEach((setting) => registerSetting(setting));
		}
	}, [getCurrentUserId]);

	const loadStoredValue = (setting: Setting): unknown => {
		if (setting.strictDefaultValue) {
			return setting.defaultValue;
		}
		if (
			localStorageSettingsRef.current &&
			localStorageSettingsRef.current[setting.id] !== undefined
		) {
			return localStorageSettingsRef.current[setting.id];
		}
		return setting.defaultValue;
	};

	useEffect(() => {
		if (settings.length === 0 || !isLocalStorageLoaded.current) return;
		const toSave = settings.reduce(
			(acc, s) => {
				acc[s.id] = s.value;
				return acc;
			},
			{} as Record<string, unknown>,
		);
		try {
			const storageKey = getStorageKey();
			localStorage.setItem(storageKey, JSON.stringify(toSave));
		} catch (error) {
			console.error("Error saving settings to localStorage:", error);
		}
	}, [settings, getStorageKey]);

	const getSettings = () => settings;

	const getSetting = (id: string) => settings.find((s) => s.id === id);

	const updateSetting = (id: string, value: unknown) => {
		setSettings((prev) =>
			prev.map((s) => {
				if (s.id !== id) return s;
				if (s.validate && !s.validate(value)) {
					console.warn(`Invalid value for ${id}:`, value);
					return s;
				}
				const updated = { ...s, value };
				if (
					s.onChange &&
					(s.liveUpdate === undefined || s.liveUpdate === true)
				) {
					s.onChange(value);
				}
				if (s.liveUpdate === false) {
					setNeedsRefresh(true);
				}
				return updated;
			}),
		);
		setHasUnsavedChanges(true);
		setTimeout(() => setHasUnsavedChanges(false), 2000);
	};

	const registerSetting = (setting: Setting) => {
		setSettings((prev) => {
			const idx = prev.findIndex((s) => s.id === setting.id);
			let valueToUse: unknown;

			if (idx >= 0) {
				valueToUse = prev[idx].value;
			} else {
				valueToUse =
					setting.value !== undefined
						? setting.value
						: loadStoredValue(setting);
			}

			if (setting.onChange) {
				setTimeout(() => setting.onChange?.(valueToUse), 0);
			}

			const settingWithValue = { ...setting, value: valueToUse };

			if (idx >= 0) {
				const updated = [...prev];
				updated[idx] = settingWithValue;
				return updated;
			}
			return [...prev, settingWithValue];
		});
	};

	const unregisterSetting = (id: string) => {
		setSettings((prev) => prev.filter((s) => s.id !== id));
	};

	const commitSetting = useCallback(
		(id: string) => {
			const settingToCommit = settings.find((s) => s.id === id);
			if (settingToCommit?.onChange && settingToCommit.liveUpdate === false) {
				setTimeout(() => settingToCommit.onChange?.(settingToCommit.value), 0);
			}
		},
		[settings],
	);

	const getSettingsByCategory = (category: string, subcategory?: string) =>
		settings.filter(
			(s) =>
				s.category === category &&
				(subcategory === undefined || s.subcategory === subcategory),
		);

	const getCategories = () => {
		const map = settings.reduce(
			(acc, s) => {
				if (!acc[s.category]) acc[s.category] = new Set<string>();
				if (s.subcategory) acc[s.category].add(s.subcategory);
				return acc;
			},
			{} as Record<string, Set<string>>,
		);
		return Object.entries(map).map(([category, subs]) => ({
			category,
			subcategories: Array.from(subs),
		}));
	};

	const searchSettings = (query: string) => {
		if (!query.trim())
			return { categories: getCategories(), allSettings: settings };

		const lowerQuery = query.toLowerCase();
		const matchingSettings = settings.filter(
			(s) =>
				s.category.toLowerCase().includes(lowerQuery) ||
				s.subcategory?.toLowerCase().includes(lowerQuery) ||
				s.label.toLowerCase().includes(lowerQuery) ||
				s.description?.toLowerCase().includes(lowerQuery),
		);

		const categoriesMap = matchingSettings.reduce(
			(acc, s) => {
				if (!acc[s.category]) acc[s.category] = new Set<string>();
				if (s.subcategory) acc[s.category].add(s.subcategory);
				return acc;
			},
			{} as Record<string, Set<string>>,
		);

		const filteredCategories = Object.entries(categoriesMap).map(
			([category, subs]) => ({
				category,
				subcategories: Array.from(subs),
			}),
		);

		return { categories: filteredCategories, allSettings: matchingSettings };
	};

	return (
		<SettingsContext.Provider
			value={{
				getSettings,
				getSetting,
				updateSetting,
				registerSetting,
				unregisterSetting,
				getSettingsByCategory,
				getCategories,
				commitSetting,
				searchSettings,
				hasUnsavedChanges,
				needsRefresh,
			}}
		>
			{children}
		</SettingsContext.Provider>
	);
};