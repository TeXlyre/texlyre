/*
 * TeXlyre - Collaborative LaTeX Editor
 * Copyright (C) 2025 Fares Abawi
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
// src/App.tsx
import '@picocss/pico/css/pico.min.css';

import './styles/global.css';
import './styles/components/editor.css';
import './styles/components/editor-tabs.css';
import './styles/components/codemirror.css';
import './styles/components/file-explorer.css';
import './styles/components/search.css';
import './styles/components/latex-typst-outline.css';
import './styles/components/backup-collab.css';
import './styles/components/resizable-panel.css';
import './styles/components/toast.css';
import './styles/components/comments.css';
import './styles/components/auth.css';
import './styles/components/project.css';
import './styles/components/share-project.css';
import './styles/components/latex-typst-templates.css'
import './styles/components/statistics.css'
import './styles/components/formatter.css'
import './styles/components/url-metadata.css'
import './styles/components/lsp.css';
import './styles/components/chat.css';
import './styles/components/latex-typst.css';
import './styles/components/plugin-header.css';
import './styles/components/settings.css';
import './styles/components/offline.css';
import './styles/components/typsetter.css';
import './styles/components/splash-screen.css'
import './styles/components/keyboard-shortcuts.css'
import './styles/components/legal.css'

import { useContext, useEffect, useState } from 'react';
import AppRouter from './components/app/AppRouter';
import PasswordModal from './components/auth/PasswordModal';
import SplashScreen from './components/common/SplashScreen';
import FileConflictModal from './components/editor/FileConflictModal';
import FileOperationToast from './components/editor/FileOperationToast.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { EditorProvider } from './contexts/EditorContext';
import { FileSystemBackupProvider } from './contexts/FileSystemBackupContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { PropertiesProvider } from './contexts/PropertiesContext.tsx';
import { SecretsContext, SecretsProvider } from './contexts/SecretsContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
	const [isInitializing, setIsInitializing] = useState(true);

	useEffect(() => {
		const initTimer = setTimeout(() => {
			setIsInitializing(false);
		}, 1200);

		return () => clearTimeout(initTimer);
	}, []);

	return (
		<>
			<SplashScreen isVisible={isInitializing} />
			<SettingsProvider>
				<OfflineProvider>
					<AuthProvider>
						<PropertiesProvider>
							<ThemeProvider
								defaultThemeId="texlyre-theme"
								defaultVariant="system"
							>
								<SecretsProvider>
									<FileSystemBackupProvider>
										<EditorProvider>
											<AppContent />
										</EditorProvider>
									</FileSystemBackupProvider>
								</SecretsProvider>
							</ThemeProvider>
						</PropertiesProvider>
					</AuthProvider>
				</OfflineProvider>
			</SettingsProvider>
		</>
	);
}

function AppContent() {
	const {
		isPasswordModalOpen,
		passwordModalMessage,
		hidePasswordModal,
		submitPassword,
	} = useContext(SecretsContext);

	return (
		<>
			<AppRouter />
			<FileConflictModal />
			<FileOperationToast />
			<PasswordModal
				isOpen={isPasswordModalOpen}
				onClose={hidePasswordModal}
				onPasswordSubmit={submitPassword}
				message={passwordModalMessage}
			/>
		</>
	);
}

export default App;