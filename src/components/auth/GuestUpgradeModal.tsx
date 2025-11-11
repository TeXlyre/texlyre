// src/components/auth/GuestUpgradeModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { UserIcon } from '../common/Icons';
import Modal from '../common/Modal';
import PrivacyModal from '../common/PrivacyModal';
import Register from './Register';

interface GuestUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeSuccess: () => void;
}

const GuestUpgradeModal: React.FC<GuestUpgradeModalProps> = ({
  isOpen,
  onClose,
  onUpgradeSuccess
}) => {
  const { upgradeGuestAccount } = useAuth();
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleUpgradeSuccess = () => {
    onUpgradeSuccess();
  };

  const handleShowPrivacy = () => {
    setShowPrivacy(true);
  };

  const handleClosePrivacy = () => {
    setShowPrivacy(false);
  };

  const handleModalClose = () => {
    if (!showPrivacy) {
      onClose();
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleModalClose}
        title={t('Upgrade Guest Account')}
        icon={UserIcon}
        size="medium">

        <div className="upgrade-modal-content">
          <div className="upgrade-info">
            <h3>{t('Keep Your Projects in This Browser')}</h3>
            <p>{t('Create a full account to save all your current projects in this browser and unlock additional features:')}


            </p>
            <ul>
              <li>{t('Persistent project storage (until browser data is cleared)')}</li>
              <li>{t('File system backup and sync capabilities')}</li>
              <li>{t('Profile customization and settings')}</li>
              <li>{t('Account security features')}</li>
              <li>{t('Persistent collaboration identity')}</li>
            </ul>
            <p>
              <strong>{t('All your current projects will be preserved in this browser session!')}</strong>
            </p>
            <div className="storage-notice">
              <p>
                <strong>{t('Important:')}</strong>{t('TeXlyre stores all data locally in your browser. Your projects will persist until you clear browser data, uninstall the browser, or use a different device. For long-term storage, regularly export your projects.')}


              </p>
            </div>
          </div>

          <Register
            onRegisterSuccess={handleUpgradeSuccess}
            onSwitchToLogin={() => onClose()}
            onShowPrivacy={handleShowPrivacy}
            isUpgrade={true}
            upgradeFunction={upgradeGuestAccount} />

        </div>
      </Modal>

      <PrivacyModal
        isOpen={showPrivacy}
        onClose={handleClosePrivacy} />

    </>);

};

export default GuestUpgradeModal;