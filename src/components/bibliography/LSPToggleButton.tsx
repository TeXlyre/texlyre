// src/components/lsp/LSPToggleButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { useSettings } from '../../hooks/useSettings';
import { pluginRegistry } from '../../plugins/PluginRegistry';

interface LSPToggleButtonProps {
	className?: string;
	pluginId: string;
}

const LSPToggleButton: React.FC<LSPToggleButtonProps> = ({
	className = '',
	pluginId,
}) => {
	const { getSetting } = useSettings();
	const [showPanel, setShowPanel] = useState(false);

	const lspPlugin = pluginRegistry.getLSPPlugin(pluginId);
	const bibPlugin = pluginRegistry.getBibliographyPlugin(pluginId);
	const plugin = lspPlugin || bibPlugin;
	if (!plugin) {
		console.warn(`Plugin with ID "${pluginId}" not found.`);
		return null;
	}

	// const isEnabled = getSetting(`${pluginId}-enabled`)?.value as boolean ?? false;
	// const showPanelSetting = getSetting(`${pluginId}-show-panel`)?.value as boolean ?? true;

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
			className={`control-button lsp-toggle-button ${showPanel ? 'active' : ''} ${className}`}
			onClick={handleTogglePanel}
			title={t('{action} {pluginName} panel', {
				action: showPanel ? t('Hide') : t('Show'),
				pluginName: plugin.name
			})}
		>
			<div className="lsp-button-content">
				{IconComponent && <IconComponent />}
				<span className={`connection-indicator ${connectionStatus}`} />
			</div>
		</button>
	);
};

export default LSPToggleButton;
