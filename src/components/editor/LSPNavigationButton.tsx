import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import {
	getSupportedLSPNavigationKinds,
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
	const triggerRef = useRef<HTMLDivElement>(null);

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

	const navigate = useCallback(
		(kind: LSPNavigationKind) => {
			setIsOpen(false);
			getEditorElement()?.dispatchEvent(
				new CustomEvent('lsp-navigate', {
					detail: { fileName, kind },
				}),
			);
		},
		[fileName, getEditorElement],
	);

	useEffect(() => {
		if (!supportedKinds.includes('definition')) return;
		const editor = getEditorElement();
		if (!editor) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key !== 'F12' ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				event.shiftKey
			) {
				return;
			}

			event.preventDefault();
			navigate('definition');
		};

		editor.addEventListener('keydown', handleKeyDown);
		return () => editor.removeEventListener('keydown', handleKeyDown);
	}, [getEditorElement, navigate, supportedKinds]);

	useEffect(() => {
		if (supportedKinds.length === 0) setIsOpen(false);
	}, [supportedKinds.length]);

	if (supportedKinds.length === 0) return null;

	const primaryKind = supportedKinds.includes('definition')
		? 'definition'
		: supportedKinds[0];
	const primaryLabel = getNavigationLabel(primaryKind);

	return (
		<div className='lsp-navigation-container'>
			<div className='lsp-navigation-group' ref={triggerRef}>
				<button
					className='control-button lsp-navigation-primary'
					onClick={() => navigate(primaryKind)}
					title={
						primaryKind === 'definition' ? `${primaryLabel} (F12)` : primaryLabel
					}
				>
					<LinkIcon />
				</button>
				<button
					className='control-button dropdown-toggle lsp-navigation-toggle'
					onClick={() => setIsOpen((open) => !open)}
					title={t('Go to...')}
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
						>
							<span className='dropdown-label'>{getNavigationLabel(kind)}</span>
							{kind === 'definition' && (
								<span className='dropdown-value'>F12</span>
							)}
						</button>
					))}
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default LSPNavigationButton;
