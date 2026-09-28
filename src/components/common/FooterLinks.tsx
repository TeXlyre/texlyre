// src/components/common/FooterLinks.tsx
import type React from 'react';
import { useRef, useState } from 'react';

import { t } from '@/i18n';
import texlyreLogo from '../../assets/images/TeXlyre_notext.png';
import { useSettings } from '../../hooks/useSettings';
import Popover from './Popover';

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
	const containerRef = useRef<HTMLParagraphElement>(null);
	const statusPageUrl = (getSetting('status-page-url')?.value as string) ?? '';

	const links = (
		<span onClick={() => setShowLinks(false)} style={{ display: 'contents' }}>
			{onShowShortcuts ? (
				<>
					<button
						type='button'
						onClick={onShowShortcuts}
						className='button'
						style={{ padding: 0 }}
						data-variant='text'
					>
						{t('Keyboard Map')}
					</button>{' '}
					•{' '}
				</>
			) : null}
			<a href='https://texlyre.org/docs/intro' target='_blank' rel='noreferrer'>
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
			<button
				type='button'
				onClick={onShowPrivacy}
				className='button'
				style={{ padding: 0 }}
				data-variant='text'
			>
				{t('Privacy')}
			</button>{' '}
			•
			<a href='https://texlyre.org' target='_blank' rel='noreferrer'>
				<img src={texlyreLogo} className='logo' alt={t('TeXlyre logo')} />
			</a>{' '}
			{`v${__APP_VERSION__}`}
		</span>
	);

	return (
		<p ref={containerRef} className='texlyre-info'>
			<button
				type='button'
				className='footer-links-toggle ui-icon-button'
				data-variant='ghost'
				data-size='sm'
				onClick={() => setShowLinks((open) => !open)}
				aria-expanded={showLinks}
				aria-label={t('Options')}
			>
				⋯
			</button>
			{!showLinks && <span className='footer-links'>{links}</span>}
			<Popover
				anchor={containerRef}
				open={showLinks}
				className='footer-links open'
				side='start'
				align='center'
				clampHeight
				style={{ zIndex: 'var(--z-dropdown)' }}
				onClose={() => setShowLinks(false)}
			>
				{links}
			</Popover>
		</p>
	);
};

export default FooterLinks;
