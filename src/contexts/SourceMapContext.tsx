// src/contexts/SourceMapContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

import { fileStorageService } from '../services/FileStorageService';
import { latexSourceMapService } from '../services/LaTeXSourceMapService';
import { typstSourceMapService } from '../services/TypstSourceMapService';
import type {
	SourceMapContextType,
	SourceMapHighlight,
	SourceMapService,
	SourceMapClickMode,
} from '../types/sourceMap';
import { useLaTeX } from '../hooks/useLaTeX';
import { useTypst } from '../hooks/useTypst';
import { useSettings } from '../hooks/useSettings';
import { useProperties } from '../hooks/useProperties';
import { gotoEditor, type EditorTarget } from '../utils/editorNavigator';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('SourceMapContext');

export const SourceMapContext = createContext<SourceMapContextType | null>(
	null,
);

interface SourceMapProviderProps {
	children: ReactNode;
}

export const SourceMapProvider: React.FC<SourceMapProviderProps> = ({
	children,
}) => {
	const { activeCompiler: latexActiveCompiler } = useLaTeX();
	const { activeCompiler: typstActiveCompiler } = useTypst();
	const { getSetting } = useSettings();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const [isAvailable, setIsAvailable] = useState(false);
	const [currentHighlight, setCurrentHighlight] =
		useState<SourceMapHighlight | null>(null);
	const [reverseClickMode, setReverseClickMode] =
		useState<SourceMapClickMode>('double');
	const [forwardClickMode, setForwardClickMode] =
		useState<SourceMapClickMode>('double');
	const [showFloatingButtons, setShowFloatingButtons] = useState(false);
	const [reverseClickEnabled, setReverseClickEnabled] = useState(true);
	const [forwardClickEnabled, setForwardClickEnabled] = useState(true);
	const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pageDimensionsRef = useRef<
		Map<number, { width: number; height: number }>
	>(new Map());
	const propertiesRegistered = useRef(false);

	const activeCompiler = latexActiveCompiler || typstActiveCompiler || null;

	const getActiveService = useCallback((): SourceMapService | null => {
		if (activeCompiler === 'latex') return latexSourceMapService;
		if (activeCompiler === 'typst') return typstSourceMapService;
		return null;
	}, [activeCompiler]);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'sourcemap-reverse-click-mode',
			category: 'UI',
			subcategory: 'Source Map',
			defaultValue: 'double',
		});
		registerProperty({
			id: 'sourcemap-forward-click-mode',
			category: 'UI',
			subcategory: 'Source Map',
			defaultValue: 'double',
		});
		registerProperty({
			id: 'sourcemap-show-floating-buttons',
			category: 'UI',
			subcategory: 'Source Map',
			defaultValue: false,
		});
		registerProperty({
			id: 'sourcemap-reverse-click-enable',
			category: 'UI',
			subcategory: 'Source Map',
			defaultValue: true,
		});
		registerProperty({
			id: 'sourcemap-forward-click-enable',
			category: 'UI',
			subcategory: 'Source Map',
			defaultValue: true,
		});
	}, [registerProperty]);

	useEffect(() => {
		const reverseMode = getProperty('sourcemap-reverse-click-mode');
		const forwardMode = getProperty('sourcemap-forward-click-mode');
		const floatingButtons = getProperty('sourcemap-show-floating-buttons');
		const reverseEnabled = getProperty('sourcemap-reverse-click-enable');
		const forwardEnabled = getProperty('sourcemap-forward-click-enable');

		if (reverseMode !== undefined)
			setReverseClickMode(reverseMode as SourceMapClickMode);
		if (forwardMode !== undefined)
			setForwardClickMode(forwardMode as SourceMapClickMode);
		if (floatingButtons !== undefined)
			setShowFloatingButtons(Boolean(floatingButtons));
		if (reverseEnabled !== undefined)
			setReverseClickEnabled(Boolean(reverseEnabled));
		if (forwardEnabled !== undefined)
			setForwardClickEnabled(Boolean(forwardEnabled));
	}, [getProperty]);

	const updateReverseClickMode = useCallback(
		(mode: SourceMapClickMode) => {
			setReverseClickMode(mode);
			setProperty('sourcemap-reverse-click-mode', mode);
		},
		[setProperty],
	);

	const updateForwardClickMode = useCallback(
		(mode: SourceMapClickMode) => {
			setForwardClickMode(mode);
			setProperty('sourcemap-forward-click-mode', mode);
		},
		[setProperty],
	);

	const updateShowFloatingButtons = useCallback(
		(show: boolean) => {
			setShowFloatingButtons(show);
			setProperty('sourcemap-show-floating-buttons', show);
		},
		[setProperty],
	);

	const updateReverseClickEnabled = useCallback(
		(enabled: boolean) => {
			setReverseClickEnabled(enabled);
			setProperty('sourcemap-reverse-click-enable', enabled);
		},
		[setProperty],
	);

	const updateForwardClickEnabled = useCallback(
		(enabled: boolean) => {
			setForwardClickEnabled(enabled);
			setProperty('sourcemap-forward-click-enable', enabled);
		},
		[setProperty],
	);

	const getSourceMapEnabled = useCallback(() => {
		if (activeCompiler === 'latex') {
			return getSetting('latex-sourcemap-enable')?.value !== false;
		}

		if (activeCompiler === 'typst') {
			return getSetting('typst-sourcemap-enable')?.value !== false;
		}

		return false;
	}, [activeCompiler, getSetting]);

	useEffect(() => {
		const update = () => {
			const service = getActiveService();

			setIsAvailable(
				getSourceMapEnabled() && (service?.isAvailable() ?? false),
			);
		};

		update();

		const unsubLatex = latexSourceMapService.addListener(update);
		const unsubTypst = typstSourceMapService.addListener(update);

		return () => {
			unsubLatex();
			unsubTypst();
		};
	}, [getActiveService, getSourceMapEnabled]);

	useEffect(() => {
		const handleDimensions = (e: Event) => {
			const detail = (e as CustomEvent).detail as {
				dimensions: Map<number, { width: number; height: number }>;
			};
			if (detail?.dimensions) {
				pageDimensionsRef.current = detail.dimensions;
			}
		};
		document.addEventListener('canvas-renderer-dimensions', handleDimensions);
		return () =>
			document.removeEventListener(
				'canvas-renderer-dimensions',
				handleDimensions,
			);
	}, []);

	const scheduleHighlightClear = useCallback(() => {
		if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
		highlightTimerRef.current = setTimeout(
			() => setCurrentHighlight(null),
			2000,
		);
	}, []);

	const forwardSync = useCallback(
		(file: string, line: number, column?: number) => {
			const service = getActiveService();
			if (!service) return;

			const result = service.forward(file, line, column);
			if (!result) return;

			setCurrentHighlight({ page: result.page, rects: result.rects });
			scheduleHighlightClear();

			document.dispatchEvent(
				new CustomEvent('canvas-renderer-navigate', {
					detail: { page: result.page },
				}),
			);
		},
		[getActiveService, scheduleHighlightClear],
	);

	const reverseSync = useCallback(
		async (page: number, x: number, y: number) => {
			const service = getActiveService();
			if (!service) return;

			const result = service.reverse(page, x, y);
			if (!result) return;

			try {
				const allFiles = await fileStorageService.getAllFiles(
					false,
					false,
					false,
				);
				const normalized = result.file.replace(/^\.?\/+/, '');

				const targetFile = allFiles.find(
					(file) =>
						!file.isDeleted &&
						(file.path === result.file ||
							file.path === `/${normalized}` ||
							file.path.endsWith(`/${normalized}`) ||
							file.name === normalized.split('/').pop()),
				);

				if (!targetFile) {
					moduleLog.warn(`Target file not found: ${result.file}`);
					return;
				}

				const target: EditorTarget = targetFile.documentId
					? { kind: 'document', documentId: targetFile.documentId }
					: { kind: 'file', fileId: targetFile.id };

				document.dispatchEvent(
					new CustomEvent('navigate-to-compiled-file', {
						detail: { filePath: targetFile.path },
					}),
				);

				gotoEditor(target, { line: result.line }, { waitForReady: false });
			} catch (error) {
				moduleLog.error('Reverse sync navigation failed:', error);
			}
		},
		[getActiveService],
	);

	const clearHighlight = useCallback(() => {
		if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
		setCurrentHighlight(null);
	}, []);

	return (
		<SourceMapContext.Provider
			value={{
				isAvailable,
				currentHighlight,
				forwardSync,
				reverseSync,
				clearHighlight,
				reverseClickMode,
				forwardClickMode,
				showFloatingButtons,
				reverseClickEnabled,
				forwardClickEnabled,
				updateReverseClickMode,
				updateForwardClickMode,
				updateShowFloatingButtons,
				updateReverseClickEnabled,
				updateForwardClickEnabled,
			}}
		>
			{children}
		</SourceMapContext.Provider>
	);
};
