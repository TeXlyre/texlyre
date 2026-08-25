// src/components/settings/ToolConfigShareActions.tsx
import type React from 'react';
import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import type { ToolConfigBlock } from '../../types/toolConfig';
import { describeConfigShare } from '../../utils/toolConfigShareUtils';
import IconButton from '../common/IconButton';
import { CopyIcon, DownloadIcon } from '../common/Icons';

interface ToolConfigShareActionsProps {
	config: ToolConfigBlock;
}

const ToolConfigShareActions: React.FC<ToolConfigShareActionsProps> = ({
	config,
}) => {
	const share = useMemo(() => describeConfigShare(config), [config]);
	const [copied, setCopied] = useState(false);

	const handleDownload = () => {
		const url = URL.createObjectURL(
			new Blob([share.json], { type: 'application/json' }),
		);
		const link = document.createElement('a');

		link.href = url;
		link.download = share.fileName;
		link.click();

		URL.revokeObjectURL(url);
	};

	const handleCopy = async () => {
		await navigator.clipboard.writeText(share.json);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<>
			<IconButton
				icon={<DownloadIcon />}
				label={t('Download recipe')}
				tooltip={t('Saves this recipe as a JSON file you can import again.')}
				onClick={handleDownload}
			/>
			<IconButton
				icon={<CopyIcon />}
				label={copied ? t('Copied!') : t('Copy recipe')}
				tooltip={t(share.message ?? t('Copies this recipe to the clipboard.'))}
				variant={share.state === 'ready' ? undefined : 'warn'}
				onClick={() => void handleCopy()}
			/>
		</>
	);
};

export default ToolConfigShareActions;
