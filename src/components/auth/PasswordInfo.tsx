// src/components/auth/PasswordInfo.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { InfoIcon } from '../common/Icons';

const PasswordInfo: React.FC = () => {
        const [showTooltip, setShowTooltip] = useState(false);

        return (
                <div className="password-info">
                        <div className="password-info-container">
                                <span className="password-info-text">{t('Passwords protect API keys and separate account spaces, not your projects.')}

                                </span>
                                <button
                                        type="button"
                                        className="button secondary icon-only password-info-help"
                                        onMouseEnter={() => setShowTooltip(true)}
                                        onMouseLeave={() => setShowTooltip(false)}
                                        onClick={() => setShowTooltip(!showTooltip)}>

                                        <InfoIcon />
                                </button>
                                {showTooltip &&
                                        <div className="password-info-tooltip">{t('Your password separates different user accounts on the same device and browser, and encrypts sensitive information like GitHub tokens and API keys if provided. The password itself is securely hashed and never stored in plain text. However, your project files and documents remain unencrypted in browser storage - anyone with physical access to this browser can view them. When using public or shared computers, export your account as a ZIP file and clear TeXlyre\'s browser data before leaving.')}






                                        </div>
                                }
                        </div>
                </div>);

};

export default PasswordInfo;