// src/components/common/PrivacyModal.tsx
import { t } from '@/i18n';
import { Trans } from 'react-i18next';
import type React from 'react';

import { InfoIcon } from './Icons';
import Modal from './Modal';

interface PrivacyModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const TransLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({
	children,
	...props
}) => <a {...props}>{children}</a>;

const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Privacy Information')}
			icon={InfoIcon}
			size='medium'
		>
			<div className='privacy-content'>
				<h3>{t('TeXlyre Data Practices')}</h3>
				<ul>
					<li>
						<strong>{t('Local Storage:')}</strong>&nbsp;
						{t('Your projects and account data stay in your browser')}
					</li>
					<li>
						<strong>{t('Real-time Collaboration:')}</strong>&nbsp;
						{t('Direct peer-to-peer connections via signaling servers')}
					</li>
					<li>
						<strong>{t('No Tracking:')}</strong>&nbsp;
						{t("We don't collect analytics or personal information")}
					</li>
					<li>
						<strong>{t('GitHub Integration:')}</strong>&nbsp;
						{t('Only used when you explicitly enable it')}
					</li>
					<li>
						<strong>{t('GitLab Integration:')}</strong>&nbsp;
						{t('Only used when you explicitly enable it')}
					</li>
					<li>
						<strong>{t('Gitea Integration:')}</strong>&nbsp;
						{t('Only used when you explicitly enable it')}
					</li>
					<li>
						<strong>{t('Forgejo Integration:')}</strong>&nbsp;
						{t('Only used when you explicitly enable it')}
					</li>
					<li>
						<strong>{t('Zotero Integration:')}</strong>&nbsp;
						{t('Only used when you explicitly enable it')}
					</li>
					<li>
						<strong>{t('OpenAlex Integration:')}</strong>&nbsp;
						{t('Only used when you explicitly enable it')}
					</li>
					<li>
						<Trans
							i18nKey='<strong>DOI Lookup:</strong> When you enable the BibTeX DOI finder, paper titles and authors are sent to the <crossref>Crossref API</crossref> to find matching DOIs'
							components={{
								strong: <strong />,
								crossref: (
									<TransLink
										href='https://www.crossref.org/'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</li>
				</ul>

				<h3>{t('Data Processing')}</h3>
				<p>
					{t(
						'IP addresses are temporarily processed through our signaling servers to establish direct connections between collaborators. No project content passes through our servers.',
					)}
				</p>

				<h3>{t('Open Infrastructure')}</h3>
				<p>
					<Trans
						i18nKey='TeXlyre uses open source signaling servers. The source code for the signaling infrastructure is available on <github>GitHub</github>.'
						components={{
							github: (
								<TransLink
									href='https://github.com/texlyre/texlyre-infrastructure'
									target='_blank'
									rel='noreferrer'
								/>
							),
						}}
					/>
				</p>

				<h3>{t('Your Control')}</h3>
				<p>
					{t(
						'You can export or delete all your data using the account menu. Everything is stored locally in your browser.',
					)}
				</p>

				<h3>{t('Third-Party Services')}</h3>
				<p>
					{t(
						'When you use optional features, data may be sent to external APIs:',
					)}
				</p>

				<ul>
					<li>
						<Trans
							i18nKey='<strong>Crossref API:</strong> Paper titles and authors when using the BibTeX DOI lookup feature (<privacy>Privacy Policy</privacy>)'
							components={{
								strong: <strong />,
								privacy: (
									<TransLink
										href='https://www.crossref.org/privacy/'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</li>

					<li>
						<Trans
							i18nKey='<strong>GitHub API:</strong> When you enable GitHub integration with your own token (<privacy>Privacy Policy</privacy>)'
							components={{
								strong: <strong />,
								privacy: (
									<TransLink
										href='https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</li>

					<li>
						<Trans
							i18nKey='<strong>GitLab API:</strong> When you enable GitLab integration with your own token (<privacy>Privacy Policy</privacy>)'
							components={{
								strong: <strong />,
								privacy: (
									<TransLink
										href='https://about.gitlab.com/privacy/'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</li>

					<li>
						<Trans
							i18nKey='<strong>Gitea API:</strong> When you enable Gitea integration with your own token (<privacy>Privacy Policy</privacy>)'
							components={{
								strong: <strong />,
								privacy: (
									<TransLink
										href='https://docs.gitea.io/en-us/privacy/'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</li>

					<li>
						<Trans
							i18nKey='<strong>Forgejo API:</strong> When you enable Forgejo integration with your own token (<privacy>Privacy Policy</privacy>). By default, the API endpoint is set to Codeberg (<codebergPrivacy>Privacy Policy</codebergPrivacy>)'
							components={{
								strong: <strong />,
								privacy: (
									<TransLink
										href='https://forgejo.org/privacy-policy/'
										target='_blank'
										rel='noreferrer'
									/>
								),
								codebergPrivacy: (
									<TransLink
										href='https://codeberg.org/Codeberg/org/src/branch/main/PrivacyPolicy.md'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</li>

					<li>
						<Trans
							i18nKey='<strong>Zotero API:</strong> When you enable Zotero integration with your own API key (<privacy>Privacy Policy</privacy>)'
							components={{
								strong: <strong />,
								privacy: (
									<TransLink
										href='https://www.zotero.org/support/privacy'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</li>

					<li>
						<Trans
							i18nKey='<strong>OpenAlex API:</strong> Search queries and, if provided, your email (mailto) and API key when using the OpenAlex integration (<privacy>Privacy Policy</privacy>)'
							components={{
								strong: <strong />,
								privacy: (
									<TransLink
										href='https://openalex.org/OpenAlex_privacy_policy.pdf'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</li>
				</ul>

				<p>
					<Trans
						i18nKey='TeXlyre is hosted on <githubPages>GitHub Pages</githubPages> and uses <cloudflareWorkers>Cloudflare Workers</cloudflareWorkers> for signaling and download servers. These services may set their own cookies for security and performance purposes.'
						components={{
							githubPages: (
								<TransLink
									href='https://pages.github.com/'
									target='_blank'
									rel='noreferrer'
								/>
							),
							cloudflareWorkers: (
								<TransLink
									href='https://workers.cloudflare.com/'
									target='_blank'
									rel='noreferrer'
								/>
							),
						}}
					/>
				</p>

				<p>
					<strong>{t("TeXlyre itself doesn't use any cookies")}</strong>&nbsp;
					{t(
						'- we only use local browser storage to save your projects on your device.',
					)}
				</p>

				<p>
					<Trans
						i18nKey='<githubPages>GitHub Pages</githubPages> • <cloudflare>Cloudflare</cloudflare>'
						components={{
							githubPages: (
								<TransLink
									href='https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#data-collection'
									target='_blank'
									rel='noopener'
								/>
							),
							cloudflare: (
								<TransLink
									href='https://www.cloudflare.com/privacypolicy/'
									target='_blank'
									rel='noopener'
								/>
							),
						}}
					/>
				</p>

				<div className='contact-info'>
					<p>
						<Trans
							i18nKey='<strong>Questions?</strong> <issues>Open an issue on our GitHub repository</issues>.'
							components={{
								strong: <strong />,
								issues: (
									<TransLink
										href='https://github.com/texlyre/texlyre/issues'
										target='_blank'
										rel='noreferrer'
									/>
								),
							}}
						/>
					</p>
				</div>
			</div>
		</Modal>
	);
};

export default PrivacyModal;
