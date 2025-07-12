// src/components/common/PrivacyModal.tsx
import type React from "react";
import { InfoIcon } from "./Icons";
import Modal from "./Modal";

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Privacy Information"
      icon={InfoIcon}
      size="medium"
    >
      <div className="privacy-content">
        <h3>How TeXlyre Works</h3>
        <ul>
          <li><strong>Local Storage:</strong> Your projects and account data stay in your browser</li>
          <li><strong>Collaboration:</strong> Direct peer-to-peer connections via signaling servers</li>
          <li><strong>No Tracking:</strong> We don't collect analytics or personal information</li>
          <li><strong>GitHub Integration:</strong> Only used when you explicitly enable it</li>
          <li><strong>DOI Lookup:</strong> When you enable the BibTeX DOI finder, paper titles and authors are sent to the <a href="https://www.crossref.org/" target="_blank" rel="noreferrer">Crossref API</a> to find matching DOIs</li>
        </ul>

        <h3>Data Processing</h3>
        <p>
          IP addresses are temporarily processed through our signaling servers
          to establish direct connections between collaborators. No project content
          passes through our servers.
        </p>

        <h3>Open Infrastructure</h3>
        <p>
          TeXlyre uses open source signaling servers. The server code is available on{" "}
          <a href="https://github.com/texlyre/texlyre-infrastructure" target="_blank" rel="noreferrer">
            GitHub
          </a>.
        </p>

        <h3>Your Control</h3>
        <p>
          You can export or delete all your data using the account menu.
          Everything is stored locally in your browser.
        </p>

        <h3>Third-Party Services</h3>
        <p>
          When you use optional features, data may be sent to external APIs:
        </p>
        <ul>
          <li><strong>Crossref API:</strong> Paper titles and authors when using the BibTeX DOI lookup feature (<a href="https://www.crossref.org/privacy/" target="_blank" rel="noreferrer">Privacy Policy</a>)</li>
          <li><strong>GitHub API:</strong> When you enable GitHub integration with your own token (<a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noreferrer">Privacy Policy</a>)</li>
        </ul>
        <p>
          TeXlyre is hosted on <a href="https://pages.github.com/" target="_blank" rel="noreferrer">GitHub Pages</a> and uses <a href="https://workers.cloudflare.com/" target="_blank" rel="noreferrer">Cloudflare Workers</a> for signaling and download servers.
          These services may set their own cookies for security and performance purposes.
        </p>
        <p>
          <strong>TeXlyre itself doesn't use any cookies</strong> - we only use local browser
          storage to save your projects on your device.
        </p>

        <p>
          <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#data-collection" target="_blank">GitHub Pages</a> • <a href="https://www.cloudflare.com/privacypolicy/" target="_blank">Cloudflare</a>
        </p>
        <div className="contact-info">
          <p><strong>Questions? </strong>
            <a href="https://github.com/texlyre/texlyre/issues" target="_blank" rel="noreferrer">
            Open an issue on our GitHub repository
            </a>.
           </p>
        </div>
      </div>
    </Modal>
  );
};

export default PrivacyModal;