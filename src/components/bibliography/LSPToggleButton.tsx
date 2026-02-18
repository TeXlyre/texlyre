// src/components/lsp/LSPToggleButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { pluginRegistry } from '../../plugins/PluginRegistry';
import { useBibliography } from '../../hooks/useBibliography';

interface LSPToggleButtonProps {
	className?: string;
	pluginId: string;
}

const LSPToggleButton: React.FC<LSPToggleButtonProps> = ({
	className = '',
	pluginId,
}) => {
	const [showPanel, setShowPanel] = useState(false);
	const { availableProviders } = useBibliography();

	const lspPlugin = pluginRegistry.getLSPPlugin(pluginId);
	const bibPlugin = lspPlugin
		? null
		: availableProviders.find(p => p.id === pluginId) ?? null;
	const plugin = lspPlugin || bibPlugin;

	if (!plugin) return null;

	const connectionStatus = plugin.getConnectionStatus();

	const handleTogglePanel = () => {
		setShowPanel(!showPanel);

		document.dispatchEvent(
			new CustomEvent('toggle-bibliography-panel', {
				detail: { show: !showPanel, pluginId }
			})
		);
	};

	const IconComponent = plugin.icon;

	return (
		<button
			className={`control-button bib-toggle-button ${showPanel ? 'active' : ''} ${className}`}
			onClick={handleTogglePanel}
			title={t('{action} {pluginName} panel', {
				action: showPanel ? t('Hide') : t('Show'),
				pluginName: plugin.name
			})}
		>
			<div className="bib-button-content">
				{IconComponent && <IconComponent />}
				<span className={`connection-indicator ${connectionStatus}`} />
			</div>
		</button>
	);
};

export default LSPToggleButton;
