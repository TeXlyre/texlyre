import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';

import { t } from '@/i18n';
import {
	getSupportedLSPNavigationKinds,
	goToLSPLocation,
	hasLSPNavigationTarget,
	type LSPNavigationKind,
} from '../../extensions/codemirror/NavigationLSPExtension';
import { genericLSPService } from '../../services/GenericLSPService';
import { ChevronDownIcon, LinkIcon } from '../common/Icons';
import PositionedDropdown from '../common/PositionedDropdown';

interface LSPNavigationButtonProps {
	fileName: string;
}

const getNavigationLabel = (kind: LSPNavigationKind): string => {
	switch (kind) {
		case 'definition':
			return t('Go to Definition');
		case 'declaration':
			return t('Go to Declaration');
		case 'typeDefinition':
			return t('Go to Type Definition');
		case 'implementation':
			return t('Go to Implementation');
	}
};

const LSPNavigationButton: React.FC<LSPNavigationButtonProps> = ({ fileName }) => {
	const [isOpen, setIsOpen] = useState(false);
	const [capabilitiesVersion, setCapabilitiesVersion] = useState(0);
	const [availableKinds, setAvailableKinds] = useState<LSPNavigationKind[]>([]);
	const triggerRef = useRef<HTMLDivElement>(null);
	const requestIdRef = useRef(0);
	const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const refresh = () => setCapabilitiesVersion((version) => version + 1);
		const unsubscribeCapabilities = genericLSPService.onCapabilitiesChange(refresh);
		const unsubscribeStatus = genericLSPService.onStatusChange(refresh);
		return () => {
			unsubscribeCapabilities();
			unsubscribeStatus();
		};
	}, []);

	const supportedKinds = useMemo(
		() => getSupportedLSPNavigationKinds(fileName),
		[fileName, capabilitiesVersion],
	);

	const getEditorElement = useCallback(
		() =>
			triggerRef.current
				?.closest('.editor-container')
				?.querySelector<HTMLElement>('.cm-editor') ?? null,
		[],
	);

	const getEditorView = useCallback(() => {
		const editor = getEditorElement();
		return editor ? EditorView.findFromDOM(editor) : null;
	}, [getEditorElement]);

	const navigate = useCallback(
		(kind: LSPNavigationKind) => {
			if (!availableKinds.includes(kind)) return;
			const view = getEditorView();
			if (!view) return;
			setIsOpen(false);
			void goToLSPLocation(view, fileName, kind);
		},
		[fileName, availableKinds, getEditorView],
	);

	const scheduleAvailabilityCheck = useCallback(() => {
		if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
		setAvailableKinds([]);
		const requestId = ++requestIdRef.current;

		checkTimeoutRef.current = setTimeout(async () => {
			const view = getEditorView();
			if (!view || supportedKinds.length === 0) return;

			const availability = await Promise.all(
				supportedKinds.map(async (kind) => ({
					kind,
					available: await hasLSPNavigationTarget(view, fileName, kind),
				})),
			);
			if (requestId !== requestIdRef.current) return;

			setAvailableKinds(
				availability
					.filter(({ available }) => available)
					.map(({ kind }) => kind),
			);
		}, 120);
	}, [fileName, getEditorView, supportedKinds]);

	useEffect(() => {
		const editor = getEditorElement();
		if (!editor || supportedKinds.length === 0) {
			setAvailableKinds([]);
			return;
		}

		const handleEditorActivity = () => scheduleAvailabilityCheck();
		const handleSelectionChange = () => {
			if (editor.contains(document.activeElement)) scheduleAvailabilityCheck();
		};

		editor.addEventListener('keyup', handleEditorActivity);
		editor.addEventListener('mouseup', handleEditorActivity);
		editor.addEventListener('input', handleEditorActivity);
		editor.addEventListener('focusin', handleEditorActivity);
		document.addEventListener('selectionchange', handleSelectionChange);
		document.addEventListener('editor-cursor-update', handleSelectionChange);
		scheduleAvailabilityCheck();

		return () => {
			editor.removeEventListener('keyup', handleEditorActivity);
			editor.removeEventListener('mouseup', handleEditorActivity);
			editor.removeEventListener('input', handleEditorActivity);
			editor.removeEventListener('focusin', handleEditorActivity);
			document.removeEventListener('selectionchange', handleSelectionChange);
			document.removeEventListener('editor-cursor-update', handleSelectionChange);
			if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
		};
	}, [getEditorElement, scheduleAvailabilityCheck, supportedKinds.length]);

	useEffect(() => {
		if (supportedKinds.length === 0) {
			setIsOpen(false);
			setAvailableKinds([]);
		}
	}, [supportedKinds.length]);

	if (supportedKinds.length === 0) return null;

	const primaryKind = supportedKinds.includes('definition')
		? 'definition'
		: supportedKinds[0];
	const primaryLabel = getNavigationLabel(primaryKind);
	const primaryAvailable = availableKinds.includes(primaryKind);
	const hasAvailableNavigation = availableKinds.length > 0;
	const noTargetLabel = t('No navigation target at cursor');

	return (
		<div className='lsp-navigation-container'>
			<div className='lsp-navigation-group' ref={triggerRef}>
				<button
					className='control-button lsp-navigation-primary'
					onClick={() => navigate(primaryKind)}
					disabled={!primaryAvailable}
					title={primaryAvailable ? primaryLabel : noTargetLabel}
				>
					<LinkIcon />
				</button>
				<button
					className='control-button dropdown-toggle lsp-navigation-toggle'
					onClick={() => setIsOpen((open) => !open)}
					disabled={!hasAvailableNavigation}
					title={hasAvailableNavigation ? t('Go to...') : noTargetLabel}
					aria-expanded={isOpen}
				>
					<ChevronDownIcon />
				</button>
			</div>

			<PositionedDropdown
				isOpen={isOpen}
				triggerElement={triggerRef.current}
				className='lsp-navigation-dropdown'
				onClose={() => setIsOpen(false)}
			>
				<div className='dropdown-section'>
					{supportedKinds.map((kind) => (
						<button
							key={kind}
							className='dropdown-item'
							onClick={() => navigate(kind)}
							disabled={!availableKinds.includes(kind)}
						>
							<span className='dropdown-label'>{getNavigationLabel(kind)}</span>
						</button>
					))}
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default LSPNavigationButton;
