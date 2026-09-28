// src/components/lsp/BibliographyToggleButton.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import { useBibliography } from '../../hooks/useBibliography';

interface BibliographyToggleButtonProps {
	className?: string;
	pluginId: string;
}

const BibliographyToggleButton: React.FC<BibliographyToggleButtonProps> = ({
	className = '',
	pluginId,
}) => {
	const [localShowPanel, setLocalShowPanel] = useState(false);
	const {
		availableProviders,
		showPanel: bibliographyPanelVisible,
		selectedProvider,
	} = useBibliography();

	const lspPlugin = pluginRegistry.getLSPPlugin(pluginId);
	const bibPlugin = lspPlugin
		? null
		: (availableProviders.find((p) => p.id === pluginId) ?? null);
	const plugin = lspPlugin || bibPlugin;

	if (!plugin) return null;

	const panelVisible = bibPlugin
		? bibliographyPanelVisible && selectedProvider === pluginId
		: localShowPanel;

	const connectionStatus = plugin.getConnectionStatus();
	const statusTone =
		connectionStatus === 'connected'
			? 'success'
			: connectionStatus === 'connecting'
				? 'warning'
				: connectionStatus === 'error'
					? 'danger'
					: 'muted';

	const handleTogglePanel = () => {
		const show = !panelVisible;
		if (!bibPlugin) setLocalShowPanel(show);

		document.dispatchEvent(
			new CustomEvent('toggle-bibliography-panel', {
				detail: { show, pluginId },
			}),
		);
	};

	const IconComponent = plugin.icon;

	return (
		<button
			type='button'
			className={`button icon-only ${panelVisible ? 'active' : ''} ${className}`}
			onClick={handleTogglePanel}
			title={t('{action} {pluginName} panel', {
				action: panelVisible ? t('Hide') : t('Show'),
				pluginName: plugin.name,
			})}
		>
			<span className='ui-status'>
				{IconComponent && <IconComponent />}
				<span
					className='ui-status-dot'
					data-tone={statusTone}
					data-state={connectionStatus === 'connecting' ? 'syncing' : undefined}
					data-placement='corner'
				/>
			</span>
		</button>
	);
};

export default BibliographyToggleButton;
