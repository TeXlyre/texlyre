// src/components/KeyboardShortcutsModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { KeyboardIcon } from './Icons';
import Modal from './Modal';
import SettingsModal from '../settings/SettingsModal';

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
    const [showSettings, setShowSettings] = useState(false);

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={t('Keyboard Shortcuts')}
                icon={KeyboardIcon}
                size="medium">

                <div className="shortcuts-content">
                    <section className="shortcuts-section">
                        <h3>{t('Global Shortcuts')}</h3>
                        <p className="section-description">{t('These shortcuts work anywhere in the application')}</p>

                        <div className="shortcuts-list">
                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('F9')}</kbd>
                                </div>
                                <div className="shortcut-description">{t('Compile document')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Shift')}</kbd> + <kbd>{t('F9')}</kbd>
                                </div>
                                <div className="shortcut-description">{t('Compile with cleared cache')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('F8')}</kbd>
                                </div>
                                <div className="shortcut-description">{t('Stop compilation')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>{t('Shift')}</kbd> + <kbd>F</kbd>
                                </div>
                                <div className="shortcut-description">{t('Open search panel')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>{t('Shift')}</kbd> + <kbd>H</kbd>
                                </div>
                                <div className="shortcut-description">{t('Open search and replace panel')}</div>
                            </div>
                        </div>
                    </section>

                    <section className="shortcuts-section">
                        <h3>{t('Editor Shortcuts')}</h3>
                        <p className="section-description">{t('These shortcuts work when the editor is focused')}</p>

                        <div className="shortcuts-list">
                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>S</kbd>
                                </div>
                                <div className="shortcut-description">{t('Save current file')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>{t('Shift')}</kbd> + <kbd>I</kbd>
                                </div>
                                <div className="shortcut-description">{t('Format document')}</div>
                            </div>
                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>I</kbd>
                                </div>
                                <div className="shortcut-description">{t('Expand selection')}</div>
                            </div>
                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Alt')}</kbd> + <kbd>C</kbd>
                                </div>
                                <div className="shortcut-description">{t('Add comment to selection')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Tab')}</kbd>
                                </div>
                                <div className="shortcut-description">{t('Indent selection')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>F</kbd>
                                </div>
                                <div className="shortcut-description">{t('Find in document')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>H</kbd>
                                </div>
                                <div className="shortcut-description">{t('Find and replace in document')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>Z</kbd>
                                </div>
                                <div className="shortcut-description">{t('Undo')}</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>{t('Ctrl')}</kbd> + <kbd>Y</kbd>
                                </div>
                                <div className="shortcut-description">{t('Redo')}</div>
                            </div>
                        </div>
                    </section>

                    <div className="info-message">
                        <p><strong>{t('Note:')}</strong>{t('Some shortcuts may vary depending on your operating system and browser.')}</p>
                        <p>
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setShowSettings(true);
                                }}>{t('Enable Vim keybindings')}&nbsp;


                            </a>{t('to use Vim-style shortcuts. Vim mode uses')}<kbd>{t('Ctrl')}</kbd> + <kbd>C</kbd>{t('to switch between insert and normal mode.')}
                        </p>
                    </div>
                </div>
            </Modal>

            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                initialCategory="Viewers"
                initialSubcategory="Text Editor" />

        </>);

};

export default KeyboardShortcutsModal;