// src/contexts/LatexSuiteContext.tsx
import type React from "react";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { pluginRegistry } from "../plugins/PluginRegistry";
import { useSettings } from "../hooks/useSettings";
import type {
	EditorSettings,
	FontFamily,
	FontSize,
} from "../types/editorSettings";
import {
	defaultEditorSettings,
	fontFamilyMap,
	fontSizeMap,
} from "../types/editorSettings";
import type { CollabConnectOptions } from "../types/collab"
import { defaultLatexSuiteSettings } from "../types/latexSuiteSettings";


interface LatexSuiteContext {
	latexSuiteSettings: unknown;
}

export const LatexSuiteContext = createContext<LatexSuiteContext>({
	latexSuiteSettings: defaultLatexSuiteSettings,
});