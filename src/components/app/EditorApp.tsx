// src/components/app/EditorApp.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import texlyreLogo from '../../assets/images/TeXlyre_notext.png';
import { ChatProvider } from '../../contexts/ChatContext';
import { CollabProvider } from '../../contexts/CollabContext';
import { FileSyncProvider } from '../../contexts/FileSyncContext';
import { FileTreeProvider } from '../../contexts/FileTreeContext';
import { LaTeXProvider } from '../../contexts/LaTeXContext';
import { TypstProvider } from '../../contexts/TypstContext';
import { useAuth } from '../../hooks/useAuth';
import { useLaTeX } from '../../hooks/useLaTeX';
import { useTypst } from '../../hooks/useTypst';
import { useCollab } from '../../hooks/useCollab';
import { useGlobalKeyboard } from '../../hooks/useGlobalKeyboard';
import { useFileSystemBackup } from '../../hooks/useFileSystemBackup';
import { useOffline } from '../../hooks/useOffline';
import { fileStorageService } from '../../services/FileStorageService';
import { pdfWindowService } from '../../services/PdfWindowService';
import type { DocumentList } from '../../types/documents';
import type { YjsDocUrl } from '../../types/yjs';
import BackupModal from '../backup/BackupModal';
import BackupStatusIndicator from '../backup/BackupStatusIndicator';
import ChatPanel from '../chat/ChatPanel';
import CollabStatusIndicator from '../collab/CollabStatusIndicator';
import { ChevronLeftIcon, EditIcon } from '../common/Icons';
import Modal from '../common/Modal';
import OfflineBanner from '../common/OfflineBanner';
import ToastContainer from '../common/ToastContainer';
import TypesetterInfo from '../common/TypesetterInfo';
import FileDocumentController from '../editor/FileDocumentController';
import LaTeXCompileButton from '../output/LaTeXCompileButton';
import TypstCompileButton from '../output/TypstCompileButton';
import ExportAccountModal from '../profile/ExportAccountModal';
import DeleteAccountModal from '../profile/DeleteAccountModal';
import ProfileSettingsModal from '../profile/ProfileSettingsModal';
import UserDropdown from '../profile/UserDropdown';
import ProjectForm from '../project/ProjectForm';
import ShareProjectButton from '../project/ShareProjectButton';
import ShareProjectModal from '../project/ShareProjectModal';
import SettingsButton from '../settings/SettingsButton';
import PrivacyModal from '../common/PrivacyModal';
import GuestUpgradeBanner from '../auth/GuestUpgradeBanner';
import GuestUpgradeModal from '../auth/GuestUpgradeModal';

interface EditorAppProps {
	docUrl: YjsDocUrl;
	onBackToProjects: () => void;
	onLogout: () => void;
	targetDocId?: string | null;
	targetFilePath?: string | null;
}

const EditorAppView: React.FC<EditorAppProps> = ({
	docUrl,
	onBackToProjects,
	onLogout,
	targetDocId,
	targetFilePath,
}) => {
	const {
		data: doc,
		changeData: changeDoc,
		isConnected,
	} = useCollab<DocumentList>();

	const { user, updateProject, getProjectById, isGuestUser } = useAuth();
	const {
		status,
		activities,
		shouldShowAutoBackupModal,
		requestAccess,
		synchronize,
		importChanges,
		disconnect,
		clearActivity,
		clearAllActivities,
		changeDirectory,
	} = useFileSystemBackup();
	const [showProfileModal, setShowProfileModal] = useState(false);
	const [showAccountExportModal, setShowAccountExportModal] = useState(false);
	const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
	const [showAutoBackupModal, setShowAutoBackupModal] = useState(false);
	const [showShareModal, setShowShareModal] = useState(false);
	const [showGuestUpgradeModal, setShowGuestUpgradeModal] = useState(false);
	const [isEditingMetadata, setIsEditingMetadata] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [localDocId, setLocalDocId] = useState<string>('');
	const [hasNavigated, setHasNavigated] = useState(false);
	const [linkedFileInfo, setLinkedFileInfo] = useState<{
		fileName?: string;
		filePath?: string;
		fileId?: string;
	} | null>(null);
	const lastSyncedMetadata = useRef({
		name: '',
		description: '',
		type: 'latex' as 'latex' | 'typst',
		mainFile: undefined as string | undefined,
		latexEngine: undefined as ('pdftex' | 'xetex' | 'luatex') | undefined,
		typstEngine: undefined as string | undefined,
		typstOutputFormat: undefined as ('pdf' | 'svg' | 'canvas') | undefined,
	});
	const { isCompiling, triggerAutoCompile } = useLaTeX();
	const { isCompiling: isTypstCompiling, triggerAutoCompile: triggerTypstAutoCompile } = useTypst();
	const { isOfflineMode } = useOffline();
	const [showPrivacy, setShowPrivacy] = useState(false);
	useGlobalKeyboard();

	const updateContent = (docId: string, content: string) => {
		changeDoc((d) => {
			if (d.documents) {
				const docIndex = d.documents.findIndex((doc) => doc.id === docId);
				if (docIndex !== -1) {
					d.documents[docIndex].content = content;
				}
			}
		});
	};

	useEffect(() => {
		const handleCompile = () => {
			if (isCompiling || isTypstCompiling) return;

			const projectType = doc?.projectMetadata?.type || 'latex';
			const buttonSelectors = projectType === 'typst'
				? ['.header-typst-compile-button .compile-button', '.header-compile-button .compile-button']
				: ['.header-compile-button .compile-button', '.header-typst-compile-button .compile-button'];

			for (const selector of buttonSelectors) {
				const button = document.querySelector(selector) as HTMLButtonElement;
				if (button && !button.disabled) {
					button.click();
					return;
				}
			}
		};

		const handleCompileClean = () => {
			if (isCompiling || isTypstCompiling) return;

			const projectType = doc?.projectMetadata?.type || 'latex';
			const containerSelectors = projectType === 'typst'
				? ['.header-typst-compile-button', '.header-compile-button']
				: ['.header-compile-button', '.header-typst-compile-button'];

			for (const selector of containerSelectors) {
				const container = document.querySelector(selector) as any;
				if (container && container.clearAndCompile) {
					container.clearAndCompile();
					return;
				}
			}
		};

		const handleStopCompilation = () => {
			if (isCompiling) {
				const latexCompileButton = document.querySelector('.header-compile-button .compile-button') as HTMLButtonElement;
				if (latexCompileButton) {
					latexCompileButton.click();
				}
			}

			if (isTypstCompiling) {
				const typstCompileButton = document.querySelector('.header-typst-compile-button .compile-button') as HTMLButtonElement;
				if (typstCompileButton) {
					typstCompileButton.click();
				}
			}
		};

		const handleTypstCompile = () => {
			if (isTypstCompiling) return;

			const typstCompileButton = document.querySelector('.header-typst-compile-button .compile-button') as HTMLButtonElement;
			if (typstCompileButton && !typstCompileButton.disabled) {
				typstCompileButton.click();
			}
		};

		document.addEventListener('trigger-compile', handleCompile);
		document.addEventListener('trigger-compile-clean', handleCompileClean);
		document.addEventListener('trigger-stop-compilation', handleStopCompilation);
		document.addEventListener('trigger-typst-compile', handleTypstCompile);

		return () => {
			document.removeEventListener('trigger-compile', handleCompile);
			document.removeEventListener('trigger-compile-clean', handleCompileClean);
			document.removeEventListener('trigger-stop-compilation', handleStopCompilation);
			document.removeEventListener('trigger-typst-compile', handleTypstCompile);
		};
	}, [isCompiling, isTypstCompiling]);

	useEffect(() => {
		if (doc && isConnected) {
			const timer = setTimeout(() => {
				triggerAutoCompile();
				triggerTypstAutoCompile();
			}, 1000);

			return () => clearTimeout(timer);
		}
	}, [doc, isConnected, triggerAutoCompile, triggerTypstAutoCompile]);

	useEffect(() => {
		if (doc) {
			const projectMetadata = sessionStorage.getItem('projectMetadata');
			if (projectMetadata) {
				const parsedMetadata = JSON.parse(projectMetadata);
				changeDoc((d) => {
					d.projectMetadata = {
						name: parsedMetadata.name || 'Untitled Project',
						description: parsedMetadata.description || '',
						type: parsedMetadata.type || 'latex',
						mainFile: parsedMetadata.mainFile,
						latexEngine: parsedMetadata.latexEngine,
						typstEngine: parsedMetadata.typstEngine,
						typstOutputFormat: parsedMetadata.typstOutputFormat
					};
					sessionStorage.removeItem('projectMetadata');
				});
			}
		}
	}, [doc, changeDoc]);

	useEffect(() => {
		if (doc?.projectMetadata) {
			const { name, description, type, mainFile, latexEngine, typstEngine, typstOutputFormat } = doc.projectMetadata;
			const projectId = sessionStorage.getItem('currentProjectId');

			if (
				name &&
				name !== 'Untitled Project' &&
				name !== 'Shared Project' &&
				projectId
			) {
				if (
					lastSyncedMetadata.current.name !== name ||
					lastSyncedMetadata.current.description !== description ||
					lastSyncedMetadata.current.type !== type ||
					lastSyncedMetadata.current.mainFile !== mainFile ||
					lastSyncedMetadata.current.latexEngine !== latexEngine ||
					lastSyncedMetadata.current.typstEngine !== typstEngine ||
					lastSyncedMetadata.current.typstOutputFormat !== typstOutputFormat
				) {
					lastSyncedMetadata.current = {
						name,
						description: description || '',
						type: type || 'latex',
						mainFile,
						latexEngine,
						typstEngine,
						typstOutputFormat
					};
					const syncProjectMetadata = async () => {
						try {
							const project = await getProjectById(projectId);
							if (project) {
								await updateProject({
									...project,
									name,
									description: description || '',
									type: type || 'latex',
								});
							}
						} catch (error) {
							console.error('Failed to sync project metadata:', error);
						}
					};
					syncProjectMetadata();
				}
			}
		}
	}, [doc?.projectMetadata, updateProject, getProjectById]);

	useEffect(() => {
		if (targetDocId && doc?.currentDocId !== undefined) {
			setLocalDocId(doc.currentDocId);
		}
	}, [doc?.currentDocId, targetDocId]);

	useEffect(() => {
		if (!hasNavigated && doc && doc.documents && targetDocId) {
			const targetDoc = doc.documents.find((d) => d.id === targetDocId);
			if (targetDoc) {
				handleSelectDocument(targetDocId);
				setHasNavigated(true);
			}
		}
	}, [doc, targetDocId, hasNavigated]);

	useEffect(() => {
		const checkLinkedFile = async () => {
			if (localDocId && doc?.documents) {
				try {
					const allFiles = await fileStorageService.getAllFiles();
					const linkedFile = allFiles.find(
						(file) => file.documentId === localDocId,
					);

					if (linkedFile) {
						setLinkedFileInfo({
							fileName: linkedFile.name,
							filePath: linkedFile.path,
							fileId: linkedFile.id,
						});
					} else {
						setLinkedFileInfo(null);
					}
				} catch (error) {
					console.error('Error checking for linked file:', error);
					setLinkedFileInfo(null);
				}
			} else {
				setLinkedFileInfo(null);
			}
		};

		checkLinkedFile();
	}, [localDocId, doc?.documents]);

	const handleAccountDeleted = async () => {
		setIsDeleteAccountModalOpen(false);
		await onLogout();
	};

	const handleGuestUpgradeSuccess = () => {
		setShowGuestUpgradeModal(false);
	};

	const handleCreateDocument = () => {
		changeDoc((d) => {
			if (!d.documents) {
				d.documents = [];
			}
			const newDocId = Math.random().toString(36).substring(2, 15);
			const newDocName = `Document ${d.documents.length + 1}`;
			d.documents.push({
				id: newDocId,
				name: newDocName,
				content: '',
			});
			d.currentDocId = newDocId;
		});
		if (doc?.documents) {
			setLocalDocId(doc.documents[doc.documents.length - 1].id);
		}
	};

	const handleSelectDocument = (docId: string) => {
		setLocalDocId(docId);
	};

	const handleUpdateContent = (content: string) => {
		updateContent(localDocId, content);
	};

	const handleRenameDocument = (docId: string, newName: string) => {
		changeDoc((d) => {
			if (d.documents) {
				const docIndex = d.documents.findIndex((doc) => doc.id === docId);
				if (docIndex !== -1) {
					d.documents[docIndex].name = newName;
				}
			}
		});
	};

	const handleUpdateProjectMetadata = (projectData: {
		name: string;
		description: string;
		type?: 'latex' | 'typst';
	}) => {
		setIsSubmitting(true);
		changeDoc((d) => {
			if (!d.projectMetadata) {
				d.projectMetadata = {
					name: projectData.name,
					description: projectData.description,
					type: projectData.type || 'latex',
				};
			} else {
				d.projectMetadata.name = projectData.name;
				d.projectMetadata.description = projectData.description;
				d.projectMetadata.type = projectData.type || 'latex';
			}
		});
		setIsSubmitting(false);
		setIsEditingMetadata(false);
	};

	const handleNavigateToLinkedFile = () => {
		if (linkedFileInfo?.filePath) {
			document.dispatchEvent(
				new CustomEvent('navigate-to-linked-file', {
					detail: {
						filePath: linkedFileInfo.filePath,
						fileId: linkedFileInfo.fileId,
					},
				}),
			);
		}
	};

	const handleExpandLatexOutput = () => {
		if (!pdfWindowService.isWindowOpen()) {
			document.dispatchEvent(new CustomEvent('expand-latex-output'));
		}
	};

	const handleExpandTypstOutput = () => {
		if (!pdfWindowService.isWindowOpen()) {
			document.dispatchEvent(new CustomEvent('expand-typst-output'));
		}
	};

	const CompileButtons = () => {
		const buttons = [
			<LaTeXCompileButton
				key="latex"
				className="header-compile-button"
				selectedDocId={localDocId}
				documents={doc?.documents}
				onNavigateToLinkedFile={handleNavigateToLinkedFile}
				onExpandLatexOutput={handleExpandLatexOutput}
				linkedFileInfo={linkedFileInfo}
				shouldNavigateOnCompile={true}
				useSharedSettings={true}
				docUrl={docUrl}
			/>,
			<TypstCompileButton
				key="typst"
				className="header-typst-compile-button"
				selectedDocId={localDocId}
				documents={doc?.documents}
				onNavigateToLinkedFile={handleNavigateToLinkedFile}
				onExpandTypstOutput={handleExpandTypstOutput}
				linkedFileInfo={linkedFileInfo}
				shouldNavigateOnCompile={true}
				useSharedSettings={true}
				docUrl={docUrl}
			/>
		];

		return projectType === 'typst' ? <>{buttons[1]}</> : <>{buttons[0]}</>;
	};

	const shareUrl = `${window.location.origin}${window.location.pathname}#${docUrl}`;
	const selectedDocument = doc?.documents?.find((d) => d.id === localDocId);
	const projectName = doc?.projectMetadata?.name || 'Untitled Project';
	const projectDescription = doc?.projectMetadata?.description || '';
	const projectType = doc?.projectMetadata?.type || 'latex';

	if (!isConnected && !doc) {
		return (
			<div className="app-container">
				<div className="loading-container">
					<div className="loading-spinner" />
					<p>Connecting to project...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="app-container">
			{isOfflineMode && <OfflineBanner />}
			{isGuestUser(user) && (
				<GuestUpgradeBanner
					onOpenUpgradeModal={() => setShowGuestUpgradeModal(true)}
				/>
			)}
			<header>
				<div className="header-left">
					<button className="back-button" onClick={onBackToProjects}>
						<ChevronLeftIcon />
						Projects
					</button>
				</div>
				<div className="header-center">
					<div
						className="project-title-container"
						onClick={() => setIsEditingMetadata(true)}
					>
						<div className="project-title-header">
							<h3 className="project-title">{projectName}</h3>
							<button
								className="edit-title-button"
								title="Edit Project Details"
								onClick={(e) => {
									e.stopPropagation();
									setIsEditingMetadata(true);
								}}
							>
								<EditIcon />
							</button>
						</div>
					</div>
					{projectDescription && (
						<div className="project-description">
							<p>{projectDescription}</p>
						</div>
					)}
				</div>
				<div className="header-right">
					<CompileButtons />

					<ShareProjectButton
						className="header-share-button"
						projectName={projectName}
						shareUrl={shareUrl}
						onOpenShareModal={() => setShowShareModal(true)}
					/>
					{!isGuestUser(user) && (
						<BackupStatusIndicator
							className="header-backup-indicator"
							currentProjectId={sessionStorage.getItem('currentProjectId')}
							isInEditor={true}
						/>
					)}
					{!isOfflineMode && (
						<CollabStatusIndicator
							className="header-collab-status"
							docUrl={docUrl}
						/>
					)}
					<SettingsButton className="header-settings-button" />
					<UserDropdown
						username={user?.username || ''}
						onLogout={onLogout}
						onOpenProfile={() => setShowProfileModal(true)}
						onOpenExport={() => setShowAccountExportModal(true)}
						onOpenDeleteAccount={() => setIsDeleteAccountModalOpen(true)}
						onOpenUpgrade={() => setShowGuestUpgradeModal(true)}
						isGuest={isGuestUser(user)}
					/>
				</div>
			</header>

			{doc?.documents && (
				<FileDocumentController
					documents={doc?.documents || []}
					selectedDocId={localDocId}
					onSelectDocument={handleSelectDocument}
					onCreateDocument={handleCreateDocument}
					onRenameDocument={handleRenameDocument}
					onUpdateContent={handleUpdateContent}
					content={selectedDocument?.content || ''}
					docUrl={docUrl}
					targetDocId={targetDocId}
					targetFilePath={targetFilePath}
				/>
			)}

			<footer>

				<div className="project-type-badge">
					Typesetter: <TypesetterInfo type={projectType} />
				</div>

				<p className="read-the-docs">
					Built with TeXlyre
					<a href="https://texlyre.github.io" target="_blank" rel="noreferrer">
						<img src={texlyreLogo} className="logo" alt="TeXlyre logo" />
					</a>
					<span className="legal-links">
						<br /> <a href="https://texlyre.github.io/docs/intro" target="_blank" rel="noreferrer">
							Documentation
						</a>
						{' '} • <a href="https://github.com/TeXlyre/texlyre" target="_blank" rel="noreferrer">
							Source Code
						</a>
						{' '} • <a href="#" onClick={(event) => {
							event.preventDefault();
							setShowPrivacy(true);
						}} className="privacy-link"> Privacy </a>
					</span>
				</p>
				<ChatPanel className="footer-chat" />
			</footer>

			<PrivacyModal
				isOpen={showPrivacy}
				onClose={() => setShowPrivacy(false)}
			/>

			<Modal
				isOpen={isEditingMetadata}
				onClose={() => setIsEditingMetadata(false)}
				title="Edit Project Details"
			>
				<ProjectForm
					project={{
						id: docUrl,
						name: projectName,
						description: projectDescription,
						type: projectType || 'latex',
						docUrl: docUrl,
						createdAt: 0,
						updatedAt: 0,
						ownerId: user?.id || '',
						tags: [],
						isFavorite: false,
					}}
					onSubmit={handleUpdateProjectMetadata}
					onCancel={() => setIsEditingMetadata(false)}
					isSubmitting={isSubmitting}
					simpleMode={true}
				/>
			</Modal>
			<ShareProjectModal
				isOpen={showShareModal}
				onClose={() => setShowShareModal(false)}
				projectName={projectName}
				shareUrl={shareUrl}
			/>
			{!isGuestUser(user) && (
				<>
					<ProfileSettingsModal
						isOpen={showProfileModal}
						onClose={() => setShowProfileModal(false)}
					/>
					<ExportAccountModal
						isOpen={showAccountExportModal}
						onClose={() => setShowAccountExportModal(false)}
					/>
					<DeleteAccountModal
						isOpen={isDeleteAccountModalOpen}
						onClose={() => setIsDeleteAccountModalOpen(false)}
						onAccountDeleted={handleAccountDeleted}
						onOpenExport={() => setShowAccountExportModal(true)}
					/>
				</>
			)}
			{isGuestUser(user) && (
				<GuestUpgradeModal
					isOpen={showGuestUpgradeModal}
					onClose={() => setShowGuestUpgradeModal(false)}
					onUpgradeSuccess={handleGuestUpgradeSuccess}
				/>
			)}
			{!isGuestUser(user) && (
				<BackupModal
					isOpen={showAutoBackupModal}
					onClose={() => setShowAutoBackupModal(false)}
					status={status}
					activities={activities}
					onRequestAccess={requestAccess}
					onSynchronize={synchronize}
					onExportToFileSystem={synchronize}
					onImportChanges={importChanges}
					onDisconnect={disconnect}
					onClearActivity={clearActivity}
					onClearAllActivities={clearAllActivities}
					onChangeDirectory={changeDirectory}
					currentProjectId={sessionStorage.getItem('currentProjectId')}
					isInEditor={true}
				/>
			)}
			<ToastContainer />
		</div>
	);
};

const EditorApp: React.FC<EditorAppProps> = (props) => {
	return (
		<CollabProvider docUrl={props.docUrl} collectionName="yjs_metadata">
			<ChatProvider docUrl={props.docUrl}>
				<FileTreeProvider docUrl={props.docUrl}>
					<FileSyncProvider docUrl={props.docUrl}>
						<LaTeXProvider>
							<TypstProvider>
								<EditorAppView {...props} />
							</TypstProvider>
						</LaTeXProvider>
					</FileSyncProvider>
				</FileTreeProvider>
			</ChatProvider>
		</CollabProvider>
	);
};

export default EditorApp;