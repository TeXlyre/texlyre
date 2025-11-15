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
	if (!lspPlugin) {
		console.warn(`LSP plugin with ID "${pluginId}" not found.`);
		return null;
	}

	const isEnabled = getSetting(`${pluginId}-enabled`)?.value as boolean ?? false;
	const showPanelSetting = getSetting(`${pluginId}-show-panel`)?.value as boolean ?? true;

	const connectionStatus = lspPlugin.getConnectionStatus();

	const handleTogglePanel = () => {
		setShowPanel(!showPanel);

		// Dispatch event to show LSP panel
		document.dispatchEvent(
			new CustomEvent('toggle-lsp-panel', {
				detail: {
					show: !showPanel,
					pluginId: pluginId
				}
			})
		);
	};

	const IconComponent = lspPlugin.icon;

	return (
		<button
			className={`control-button lsp-toggle-button ${showPanel ? 'active' : ''} ${className}`}
			onClick={handleTogglePanel}
			title={t('{action} {pluginName} panel', {
				action: showPanel ? t('Hide') : t('Show'),
				pluginName: lspPlugin.name
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