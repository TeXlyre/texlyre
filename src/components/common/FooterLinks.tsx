// src/components/common/FooterLinks.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import texlyreLogo from '../../assets/images/TeXlyre_notext.png';
import { useSettings } from '../../hooks/useSettings';

interface FooterLinksProps {
	onShowPrivacy: () => void;
	onShowShortcuts?: () => void;
}

const FooterLinks: React.FC<FooterLinksProps> = ({
	onShowPrivacy,
	onShowShortcuts,
}) => {
	const { getSetting } = useSettings();
	const [showLinks, setShowLinks] = useState(false);
	const statusPageUrl = (getSetting('status-page-url')?.value as string) ?? '';

	return (
		<p className='texlyre-info'>
			<button
				type='button'
				className='footer-links-toggle'
				onClick={() => setShowLinks((open) => !open)}
				aria-expanded={showLinks}
				aria-label={t('Options')}
			>
				⋯
			</button>
			<span
				className={`footer-links ${showLinks ? 'open' : ''}`}
				onClick={() => setShowLinks(false)}
			>
				{onShowShortcuts ? (
					<>
						<button
							type='button'
							onClick={onShowShortcuts}
							className='shortcuts-link'
						>
							{t('Keyboard Map')}
						</button>{' '}
						•{' '}
					</>
				) : null}
				<a
					href='https://texlyre.org/docs/intro'
					target='_blank'
					rel='noreferrer'
				>
					{t('Documentation')}
				</a>{' '}
				•{' '}
				<a
					href='https://github.com/TeXlyre/texlyre'
					target='_blank'
					rel='noreferrer'
				>
					{t('Source Code')}
				</a>{' '}
				•{' '}
				{statusPageUrl ? (
					<>
						<a href={statusPageUrl} target='_blank' rel='noreferrer'>
							{t('Service Status')}
						</a>{' '}
						•{' '}
					</>
				) : null}
				<button type='button' onClick={onShowPrivacy} className='privacy-link'>
					{t('Privacy')}
				</button>{' '}
				•
				<a href='https://texlyre.org' target='_blank' rel='noreferrer'>
					<img src={texlyreLogo} className='logo' alt={t('TeXlyre logo')} />
				</a>{' '}
				{`v${__APP_VERSION__}`}
			</span>
		</p>
	);
};

export default FooterLinks;
