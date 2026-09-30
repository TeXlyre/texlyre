// src/hooks/editor/useEditorLayout.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { useProperties } from '../useProperties';
import { useTheme } from '../useTheme';

export const useEditorLayout = () => {
	const { currentLayout } = useTheme();
	const {
		isReady: arePropertiesReady,
		getProperty,
		setProperty,
		registerProperty,
	} = useProperties();
	const propertiesRegistered = useRef(false);
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);

	const [sidebarWidth, setSidebarWidth] = useState(
		currentLayout?.defaultFileExplorerWidth || 250,
	);
	const [explorerHeight, setExplorerHeight] = useState(600);
	const [latexOutputWidth, setLatexOutputWidth] = useState(550);
	const [typstOutputWidth, setTypstOutputWidth] = useState(550);
	const [externalOutputWidth, setExternalOutputWidth] = useState(550);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [latexOutputCollapsed, setLatexOutputCollapsed] = useState(false);
	const [typstOutputCollapsed, setTypstOutputCollapsed] = useState(false);
	const [externalOutputCollapsed, setExternalOutputCollapsed] = useState(false);
	const [toolbarVisible, setToolbarVisible] = useState(true);
	const [outlinePreview, setOutlinePreview] = useState(false);
	const [outlineMaximized, setOutlineMaximized] = useState(false);

	const outlineControls = currentLayout?.outlineControls;
	const hasOutlinePreview = outlineControls?.preview === true;
	const hasOutlineMaximize = outlineControls?.maximize === true;

	const handleSidebarResize = useCallback(
		(width: number) => {
			setSidebarWidth(width);
			setProperty('sidebar-width', width);
		},
		[setProperty],
	);

	const handleSidebarCollapse = useCallback(
		(collapsed: boolean) => {
			setSidebarCollapsed(collapsed);
			setProperty('sidebar-collapsed', collapsed);
		},
		[setProperty],
	);

	const handleExplorerResize = useCallback(
		(height: number) => {
			setExplorerHeight(height);
			setProperty('explorer-height', height);
		},
		[setProperty],
	);

	const handleLatexOutputWidthResize = useCallback(
		(width: number) => {
			setLatexOutputWidth(width);
			setProperty('latex-output-width', width);
		},
		[setProperty],
	);

	const handleLatexOutputCollapse = useCallback(
		(collapsed: boolean) => {
			setLatexOutputCollapsed(collapsed);
			setProperty('latex-output-collapsed', collapsed);
		},
		[setProperty],
	);

	const handleTypstOutputWidthResize = useCallback(
		(width: number) => {
			setTypstOutputWidth(width);
			setProperty('typst-output-width', width);
		},
		[setProperty],
	);

	const handleTypstOutputCollapse = useCallback(
		(collapsed: boolean) => {
			setTypstOutputCollapsed(collapsed);
			setProperty('typst-output-collapsed', collapsed);
		},
		[setProperty],
	);

	const handleExternalOutputWidthResize = useCallback(
		(width: number) => {
			setExternalOutputWidth(width);
			setProperty('external-output-width', width);
		},
		[setProperty],
	);

	const handleExternalOutputCollapse = useCallback(
		(collapsed: boolean) => {
			setExternalOutputCollapsed(collapsed);
			setProperty('external-output-collapsed', collapsed);
		},
		[setProperty],
	);

	const handleToolbarToggle = useCallback(
		(visible: boolean) => {
			setToolbarVisible(visible);
			setProperty('toolbar-visible', visible);
		},
		[setProperty],
	);

	const setStoredOutlinePreview = useCallback(
		(enabled: boolean) => {
			setOutlinePreview(enabled);
			setProperty('mobile-outline-preview', enabled);
		},
		[setProperty],
	);

	const setStoredOutlineMaximized = useCallback(
		(enabled: boolean) => {
			setOutlineMaximized(enabled);
			setProperty('mobile-outline-maximized', enabled);
		},
		[setProperty],
	);

	const outlineThemeControls = {
		previewEnabled: hasOutlinePreview && outlinePreview,
		onPreviewToggle: hasOutlinePreview
			? () => setStoredOutlinePreview(!outlinePreview)
			: undefined,
		maximized: hasOutlineMaximize && outlineMaximized,
		onMaximizeToggle: hasOutlineMaximize
			? () => setStoredOutlineMaximized(!outlineMaximized)
			: undefined,
		onCollapsedChange: hasOutlineMaximize
			? (collapsed: boolean) => {
					if (collapsed) setStoredOutlineMaximized(false);
				}
			: undefined,
	};

	/* biome-ignore lint/correctness/useExhaustiveDependencies: One-time registration guarded by ref; default values are read for initial registration only. */
	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'sidebar-width',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: currentLayout?.defaultFileExplorerWidth || 250,
		});
		registerProperty({
			id: 'external-output-width',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: externalOutputWidth,
		});
		registerProperty({
			id: 'latex-output-width',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: latexOutputWidth,
		});
		registerProperty({
			id: 'typst-output-width',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: typstOutputWidth,
		});
		registerProperty({
			id: 'sidebar-collapsed',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: false,
		});
		registerProperty({
			id: 'external-output-collapsed',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: false,
		});
		registerProperty({
			id: 'latex-output-collapsed',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: false,
		});
		registerProperty({
			id: 'typst-output-collapsed',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: false,
		});
		registerProperty({
			id: 'explorer-height',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: explorerHeight,
		});
		registerProperty({
			id: 'header-visible',
			category: 'UI',
			subcategory: 'Editor',
			defaultValue: true,
		});
		registerProperty({
			id: 'toolbar-visible',
			category: 'UI',
			subcategory: 'Editor',
			defaultValue: true,
		});
		registerProperty({
			id: 'mobile-outline-preview',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: false,
		});
		registerProperty({
			id: 'mobile-outline-maximized',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: false,
		});
	}, [registerProperty]);

	useEffect(() => {
		if (!arePropertiesReady || propertiesLoaded) return;

		const storedSidebarWidth = getProperty('sidebar-width');
		const storedExternalWidth = getProperty('external-output-width');
		const storedLatexWidth = getProperty('latex-output-width');
		const storedTypstWidth = getProperty('typst-output-width');
		const storedSidebarCollapsed = getProperty('sidebar-collapsed');
		const storedExternalCollapsed = getProperty('external-output-collapsed');
		const storedLatexCollapsed = getProperty('latex-output-collapsed');
		const storedTypstCollapsed = getProperty('typst-output-collapsed');
		const storedOutlineHeight = getProperty('explorer-height');
		const storedToolbarVisible = getProperty('toolbar-visible');
		const storedMobileOutlinePreview = getProperty('mobile-outline-preview');
		const storedMobileOutlineMaximized = getProperty(
			'mobile-outline-maximized',
		);

		if (storedSidebarWidth !== undefined)
			setSidebarWidth(Number(storedSidebarWidth));
		if (storedExternalWidth !== undefined)
			setExternalOutputWidth(Number(storedExternalWidth));
		if (storedLatexWidth !== undefined)
			setLatexOutputWidth(Number(storedLatexWidth));
		if (storedTypstWidth !== undefined)
			setTypstOutputWidth(Number(storedTypstWidth));
		if (storedSidebarCollapsed !== undefined)
			setSidebarCollapsed(Boolean(storedSidebarCollapsed));
		if (storedExternalCollapsed !== undefined)
			setExternalOutputCollapsed(Boolean(storedExternalCollapsed));
		if (storedLatexCollapsed !== undefined)
			setLatexOutputCollapsed(Boolean(storedLatexCollapsed));
		if (storedTypstCollapsed !== undefined)
			setTypstOutputCollapsed(Boolean(storedTypstCollapsed));
		if (storedOutlineHeight !== undefined)
			setExplorerHeight(Number(storedOutlineHeight));
		if (storedToolbarVisible !== undefined)
			setToolbarVisible(Boolean(storedToolbarVisible));
		if (storedMobileOutlinePreview !== undefined)
			setOutlinePreview(Boolean(storedMobileOutlinePreview));
		if (storedMobileOutlineMaximized !== undefined)
			setOutlineMaximized(Boolean(storedMobileOutlineMaximized));

		setPropertiesLoaded(true);
	}, [arePropertiesReady, propertiesLoaded, getProperty]);

	return {
		currentLayout,
		sidebarWidth,
		explorerHeight,
		latexOutputWidth,
		typstOutputWidth,
		externalOutputWidth,
		sidebarCollapsed,
		latexOutputCollapsed,
		typstOutputCollapsed,
		externalOutputCollapsed,
		toolbarVisible,
		outlinePreview,
		outlineMaximized,
		hasOutlinePreview,
		hasOutlineMaximize,
		outlineThemeControls,
		handleSidebarResize,
		handleSidebarCollapse,
		handleExplorerResize,
		handleLatexOutputWidthResize,
		handleLatexOutputCollapse,
		handleTypstOutputWidthResize,
		handleTypstOutputCollapse,
		handleExternalOutputWidthResize,
		handleExternalOutputCollapse,
		handleToolbarToggle,
	};
};
