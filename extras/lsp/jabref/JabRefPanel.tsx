// extras/lsp/jabref/JabRefPanel.tsx
import { t } from "@/i18n";
import type React from 'react';
import type { LSPPanelProps } from '@/plugins/PluginInterface';

const JabRefPanel: React.FC<LSPPanelProps> = ({
  className = '',
  onItemSelect,
  searchQuery = '',
  onSearchChange,
  pluginInstance
}) => {
  // JabRef-specific customizations would go here
  // For now, the main LSP panel handles all bibliography functionality

  return (
    <div className={`jabref-panel ${className}`}>
			<div className="jabref-specific-info">{t('This is handled by the main LSP panel for bibliography providers.')}

      </div>
		</div>);

};

export default JabRefPanel;