// src/components/KeyboardShortcutsModal.tsx
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
                title="Keyboard Shortcuts"
                icon={KeyboardIcon}
                size="medium"
            >
                <div className="shortcuts-content">
                    <section className="shortcuts-section">
                        <h3>Global Shortcuts</h3>
                        <p className="section-description">These shortcuts work anywhere in the application</p>

                        <div className="shortcuts-list">
                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>F9</kbd>
                                </div>
                                <div className="shortcut-description">Compile document</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Shift</kbd> + <kbd>F9</kbd>
                                </div>
                                <div className="shortcut-description">Compile with cleared cache</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>F8</kbd>
                                </div>
                                <div className="shortcut-description">Stop compilation</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd>
                                </div>
                                <div className="shortcut-description">Open search panel</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd>
                                </div>
                                <div className="shortcut-description">Open search and replace panel</div>
                            </div>
                        </div>
                    </section>

                    <section className="shortcuts-section">
                        <h3>Editor Shortcuts</h3>
                        <p className="section-description">These shortcuts work when the editor is focused</p>

                        <div className="shortcuts-list">
                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>S</kbd>
                                </div>
                                <div className="shortcut-description">Save current file</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd>
                                </div>
                                <div className="shortcut-description">Format document</div>
                            </div>
                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>I</kbd>
                                </div>
                                <div className="shortcut-description">Expand selection</div>
                            </div>
                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Alt</kbd> + <kbd>C</kbd>
                                </div>
                                <div className="shortcut-description">Add comment to selection</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Tab</kbd>
                                </div>
                                <div className="shortcut-description">Indent selection</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>F</kbd>
                                </div>
                                <div className="shortcut-description">Find in document</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>H</kbd>
                                </div>
                                <div className="shortcut-description">Find and replace in document</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>Z</kbd>
                                </div>
                                <div className="shortcut-description">Undo</div>
                            </div>

                            <div className="shortcut-item">
                                <div className="shortcut-keys">
                                    <kbd>Ctrl</kbd> + <kbd>Y</kbd>
                                </div>
                                <div className="shortcut-description">Redo</div>
                            </div>
                        </div>
                    </section>

                    <div className="info-message">
                        <p><strong>Note:</strong> Some shortcuts may vary depending on your operating system and browser.</p>
                        <p>
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setShowSettings(true);
                                }}
                            >
                                Enable Vim keybindings
                            </a> to use Vim-style shortcuts. Vim mode uses <kbd>Ctrl</kbd> + <kbd>C</kbd> to switch between insert and normal mode.
                        </p>
                    </div>
                </div>
            </Modal>

            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                initialCategory="Viewers"
                initialSubcategory="Text Editor"
            />
        </>
    );
};

export default KeyboardShortcutsModal;