// src/components/editor/LSPNavigationButton.tsx
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';

import { t } from '@/i18n';
import {
	getSupportedLSPNavigationKinds,
	goToLSPLocation,
	resolveLSPNavigationTarget,
	type LSPNavigationKind,
} from '../../extensions/codemirror/lsp/lspNavigation';
import { useEditor } from '../../hooks/useEditor';
import { genericLSPService } from '../../services/GenericLSPService';
import { ChevronDownIcon, GoToDefinitionIcon } from '../common/Icons';
import PositionedDropdown from '../common/PositionedDropdown';

interface LSPNavigationButtonProps {
	fileName: string;
}

const NAVIGATION_LABELS: Record<LSPNavigationKind, string> = {
	definition: t('Go to Definition'),
	declaration: t('Go to Declaration'),
	typeDefinition: t('Go to Type Definition'),
	implementation: t('Go to Implementation'),
};

const LSPNavigationButton: React.FC<LSPNavigationButtonProps> = ({
	fileName,
}) => {
	const { editorSettings } = useEditor();
	const [isOpen, setIsOpen] = useState(false);
	const [hasTarget, setHasTarget] = useState(false);
	const [capabilitiesVersion, setCapabilitiesVersion] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	const isEnabled = editorSettings.languageFeatures.lspNavigation;

	useEffect(() => {
		if (!isEnabled) return;

		const refresh = () => setCapabilitiesVersion((version) => version + 1);
		const unsubscribeCapabilities =
			genericLSPService.onCapabilitiesChange(refresh);
		const unsubscribeStatus = genericLSPService.onStatusChange(refresh);

		return () => {
			unsubscribeCapabilities();
			unsubscribeStatus();
		};
	}, [isEnabled]);

	/* biome-ignore lint/correctness/useExhaustiveDependencies(capabilitiesVersion): Server capabilities arrive asynchronously and are the intentional refresh trigger. */
	const supportedKinds = useMemo(
		() => (isEnabled ? getSupportedLSPNavigationKinds(fileName) : []),
		[fileName, isEnabled, capabilitiesVersion],
	);

	const primaryKind = supportedKinds.includes('definition')
		? 'definition'
		: supportedKinds[0];

	const getEditorView = useCallback(() => {
		const editor = containerRef.current
			?.closest('.editor-container')
			?.querySelector<HTMLElement>('.cm-editor');
		return editor ? EditorView.findFromDOM(editor) : null;
	}, []);

	useEffect(() => {
		if (!primaryKind) {
			setHasTarget(false);
			return;
		}

		let current = 0;

		const probe = async () => {
			const view = getEditorView();
			if (!view) {
				setHasTarget(false);
				return;
			}

			const token = ++current;
			const target = await resolveLSPNavigationTarget(
				view,
				fileName,
				primaryKind,
			);
			if (token === current) setHasTarget(Boolean(target));
		};

		const schedule = () => void probe();

		document.addEventListener('editor-cursor-update', schedule);
		document.addEventListener('editor-ready', schedule);
		schedule();

		return () => {
			current++;
			document.removeEventListener('editor-cursor-update', schedule);
			document.removeEventListener('editor-ready', schedule);
		};
	}, [fileName, primaryKind, getEditorView]);

	const navigate = useCallback(
		(kind: LSPNavigationKind) => {
			const view = getEditorView();
			if (!view) return;

			setIsOpen(false);
			void goToLSPLocation(view, fileName, kind);
		},
		[fileName, getEditorView],
	);

	if (!primaryKind) return null;

	const noTargetLabel = t('No target at cursor');

	return (
		<div className='control-group lsp-navigation-container' ref={containerRef}>
			<div className='split-button-group'>
				<button
					className='control-button'
					onClick={() => navigate(primaryKind)}
					disabled={!hasTarget}
					title={hasTarget ? NAVIGATION_LABELS[primaryKind] : noTargetLabel}
				>
					<GoToDefinitionIcon />
				</button>

				{supportedKinds.length > 1 && (
					<button
						className='control-button dropdown-toggle'
						onClick={() => setIsOpen((open) => !open)}
						disabled={!hasTarget}
						title={hasTarget ? t('Go to...') : noTargetLabel}
						aria-expanded={isOpen}
					>
						<ChevronDownIcon />
					</button>
				)}
			</div>

			<PositionedDropdown
				isOpen={isOpen}
				triggerElement={
					containerRef.current?.querySelector(
						'.split-button-group',
					) as HTMLElement
				}
				className='dropdown-menu lsp-navigation-dropdown'
				onClose={() => setIsOpen(false)}
			>
				<div className='dropdown-section'>
					{supportedKinds.map((kind) => (
						<button
							key={kind}
							className='dropdown-item'
							onClick={() => navigate(kind)}
						>
							<GoToDefinitionIcon />
							<span className='dropdown-label'>{NAVIGATION_LABELS[kind]}</span>
						</button>
					))}
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default LSPNavigationButton;
