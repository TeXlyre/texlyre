// src/components/common/PrivacyModal.tsx
import { t } from '@/i18n';
import type React from 'react';

import { InfoIcon } from './Icons';
import Modal from './Modal';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Privacy Information')}
      icon={InfoIcon}
      size="medium">

      <div className="privacy-content">
        <h3>{t('How TeXlyre Works')}</h3>
        <ul>
          <li><strong>{t('Local Storage:')}</strong>&nbsp;{t('Your projects and account data stay in your browser')}</li>
          <li><strong>{t('Real-time Collaboration:')}</strong>&nbsp;{t('Direct peer-to-peer connections via signaling servers')}</li>
          <li><strong>{t('No Tracking:')}</strong>&nbsp;{t('We don\'t collect analytics or personal information')}</li>
          <li><strong>{t('GitHub Integration:')}</strong>&nbsp;{t('Only used when you explicitly enable it')}</li>
          <li><strong>{t('GitLab Integration:')}</strong>&nbsp;{t('Only used when you explicitly enable it')}</li>
          <li><strong>{t('Gitea Integration:')}</strong>&nbsp;{t('Only used when you explicitly enable it')}</li>
          <li><strong>{t('Forgejo Integration:')}</strong>&nbsp;{t('Only used when you explicitly enable it')}</li>
          <li><strong>{t('Zotero Integration:')}</strong>&nbsp;{t('Only used when you explicitly enable it')}</li>
          <li><strong>{t('DOI Lookup:')}</strong>&nbsp;{t('When you enable the BibTeX DOI finder, paper titles and authors are sent to the')}&nbsp;<a href="https://www.crossref.org/" target="_blank" rel="noreferrer">{t('Crossref API')}</a>&nbsp;{t('to find matching DOIs')}</li>
        </ul>

        <h3>{t('Data Processing')}</h3>
        <p>{t('IP addresses are temporarily processed through our signaling servers to establish direct connections between collaborators. No project content passes through our servers.')}



        </p>

        <h3>{t('Open Infrastructure')}</h3>
        <p>{t('TeXlyre uses open source signaling servers. The server code is available on')}
          {' '}
          <a href="https://github.com/texlyre/texlyre-infrastructure" target="_blank" rel="noreferrer">{t('GitHub')}

          </a>.
        </p>

        <h3>{t('Your Control')}</h3>
        <p>{t('You can export or delete all your data using the account menu. Everything is stored locally in your browser.')}


        </p>

        <h3>{t('Third-Party Services')}</h3>
        <p>{t('When you use optional features, data may be sent to external APIs:')}

        </p>
        <ul>
          <li><strong>{t('Crossref API:')}</strong>&nbsp;{t('Paper titles and authors when using the BibTeX DOI lookup feature (')}<a href="https://www.crossref.org/privacy/" target="_blank" rel="noreferrer">{t('Privacy Policy')}</a>)</li>
          <li><strong>{t('GitHub API:')}</strong>&nbsp;{t('When you enable GitHub integration with your own token (')}<a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noreferrer">{t('Privacy Policy')}</a>)</li>
          <li><strong>{t('GitLab API:')}</strong>&nbsp;{t('When you enable GitLab integration with your own token (')}<a href="https://about.gitlab.com/privacy/" target="_blank" rel="noreferrer">{t('Privacy Policy')}</a>)</li>
          <li><strong>{t('Gitea API:')}</strong>&nbsp;{t('When you enable Gitea integration with your own token (')}<a href="https://docs.gitea.io/en-us/privacy/" target="_blank" rel="noreferrer">{t('Privacy Policy')}</a>)</li>
          <li><strong>{t('Forgejo API:')}</strong>&nbsp;{t('When you enable Forgejo integration with your own token (')}<a href="https://forgejo.org/privacy-policy/" target="_blank" rel="noreferrer">{t('Privacy Policy')}</a>{t(').')}{t('By default, the API endpoint is set to Codeberg (')}<a href="https://codeberg.org/Codeberg/org/src/branch/main/PrivacyPolicy.md" target="_blank" rel="noreferrer">{t('Privacy Policy')}</a>)</li>
          <li><strong>{t('Zotero API:')}</strong>&nbsp;{t('When you enable Zotero integration with your own API key (')}<a href="https://www.zotero.org/support/privacy" target="_blank" rel="noreferrer">{t('Privacy Policy')}</a>)</li>
        </ul>
        <p>{t('TeXlyre is hosted on')}
          &nbsp;<a href="https://pages.github.com/" target="_blank" rel="noreferrer">{t('GitHub Pages')}</a>&nbsp;{t('and uses')}&nbsp;<a href="https://workers.cloudflare.com/" target="_blank" rel="noreferrer">{t('Cloudflare Workers')}</a>&nbsp;{t('for signaling and download servers. These services may set their own cookies for security and performance purposes.')}

        </p>
        <p>
          <strong>{t('TeXlyre itself doesn\'t use any cookies')}</strong>&nbsp;{t('- we only use local browser storage to save your projects on your device.')}

        </p>

        <p>
          <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#data-collection" target="_blank">{t('GitHub Pages')}</a> • <a href="https://www.cloudflare.com/privacypolicy/" target="_blank">{t('Cloudflare')}</a>
        </p>
        <div className="contact-info">
          <p><strong>{t('Questions?')}</strong>
            <a href="https://github.com/texlyre/texlyre/issues" target="_blank" rel="noreferrer">&nbsp;{t('Open an issue on our GitHub repository')}

            </a>.
          </p>
        </div>
      </div>
    </Modal>);

};

export default PrivacyModal;
