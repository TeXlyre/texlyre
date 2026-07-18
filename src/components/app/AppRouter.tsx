// src/components/app/AppRouter.tsx
import type React from 'react';
import {
	lazy,
	useCallback,
	useEffect,
	useRef,
	useState,
	Suspense,
} from 'react';

import { useAuth } from '../../hooks/useAuth';
import { collabService } from '../../services/CollabService';
import { fileStorageService } from '../../services/FileStorageService';
import {
	shareTargetService,
	type PendingShare,
} from '../../services/ShareTargetService';
import type { YjsDocUrl } from '../../types/yjs';
import {
	isValidYjsUrl,
	parseUrlFragments,
	pushHash,
	replaceHash,
} from '../../utils/urlUtils';
import { batchExtractZip } from '../../utils/zipUtils';
import AuthApp from './AuthApp';
import EditorApp from './EditorApp';
import LoadingScreen from './LoadingScreen';
import ProjectApp from './ProjectApp';
import PrivacyModal from '../common/PrivacyModal';
import ShareTargetModal from '../project/ShareTargetModal';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('AppRouter');

interface UrlProjectParams {
	newProjectName?: string;
	newProjectDescription?: string;
	newProjectType?: string;
	newProjectTags?: string;
	newProjectFiles?: string;
	newProjectGroup?: string;
	compile?: string;
	file?: string;
}

const parseUrlProjectParams = (hashUrl: string): UrlProjectParams | null => {
	try {
		const params: UrlProjectParams = {};
		const parts = hashUrl.split('&');

		for (const part of parts) {
			if (part.startsWith('newProjectName:')) {
				params.newProjectName = decodeURIComponent(part.slice(15));
			} else if (part.startsWith('newProjectDescription:')) {
				params.newProjectDescription = decodeURIComponent(part.slice(22));
			} else if (part.startsWith('newProjectType:')) {
				params.newProjectType = decodeURIComponent(part.slice(15));
			} else if (part.startsWith('newProjectGroup:')) {
				params.newProjectGroup = decodeURIComponent(part.slice(16));
			} else if (part.startsWith('newProjectTags:')) {
				params.newProjectTags = decodeURIComponent(part.slice(15));
			} else if (part.startsWith('newProjectFiles:')) {
				params.newProjectFiles = decodeURIComponent(part.slice(16));
			} else if (part.startsWith('compile:')) {
				params.compile = decodeURIComponent(part.slice(8));
			} else if (part.startsWith('file:')) {
				params.file = decodeURIComponent(part.slice(5));
			}
		}

		return params.newProjectName ? params : null;
	} catch (error) {
		moduleLog.error('Error parsing URL project params:', error);
		return null;
	}
};

const downloadAndExtractZip = async (
	zipUrl: string,
	projectId: string,
): Promise<void> => {
	try {
		const response = await fetch(zipUrl);
		if (!response.ok) {
			throw new Error(`Failed to download zip: ${response.statusText}`);
		}

		const zipBlob = await response.blob();
		const zipFile = new File([zipBlob], 'template.zip', {
			type: 'application/zip',
		});

		await fileStorageService.initialize(`yjs:${projectId}`);

		const { files, directories } = await batchExtractZip(zipFile, '/');
		const allFiles = [...directories, ...files];

		await fileStorageService.batchStoreFiles(allFiles, {
			showConflictDialog: false,
			preserveTimestamp: false,
		});
	} catch (error) {
		moduleLog.error('Error downloading and extracting zip:', error);
	}
};

const AppRouter: React.FC = () => {
	const {
		isAuthenticated,
		isInitializing,
		logout,
		createProject,
		getProjects,
	} = useAuth();

	const [currentView, setCurrentView] = useState<
		'auth' | 'projects' | 'editor'
	>('auth');
	const [docUrl, setDocUrl] = useState<YjsDocUrl | null>(null);
	const [_currentProjectId, setCurrentProjectId] = useState<string | null>(
		null,
	);
	const [targetDocId, setTargetDocId] = useState<string | null>(null);
	const [targetFilePath, setTargetFilePath] = useState<string | null>(null);
	const [isCreatingProject, setIsCreatingProject] = useState(false);
	const [showPrivacy, setShowPrivacy] = useState(false);
	const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);

	const [isPdfViewerWindow, setIsPdfViewerWindow] = useState(false);
	const [pdfViewerProjectId, setPdfViewerProjectId] = useState<string | null>(
		null,
	);

	const processedProjectHashRef = useRef<string | null>(null);

	const createProjectForDocument = useCallback(
		async (
			docUrl: string,
			name: string,
			description: string,
			type: string,
			group?: string,
		) => {
			try {
				await new Promise((resolve) => setTimeout(resolve, 500));

				const project = await createProject({
					name,
					description,
					type,
					group,
					docUrl,
					tags: [],
					isFavorite: false,
				});

				setCurrentProjectId(project.id);
				sessionStorage.setItem('currentProjectId', project.id);

				return project;
			} catch (error) {
				moduleLog.error('Failed to create project for document:', error);
				throw error;
			}
		},
		[createProject],
	);

	const createProjectFromUrl = useCallback(
		async (params: UrlProjectParams): Promise<string | null> => {
			if (!isAuthenticated || !params.newProjectName) return null;

			setIsCreatingProject(true);

			try {
				const newProject = await createProject({
					name: params.newProjectName,
					description: params.newProjectDescription || '',
					type: params.newProjectType || 'latex',
					group: params.newProjectGroup || undefined,
					tags: params.newProjectTags?.split(',') || [],
					isFavorite: false,
				});

				const projectId = newProject.docUrl.startsWith('yjs:')
					? newProject.docUrl.slice(4)
					: newProject.docUrl;

				if (params.newProjectFiles) {
					await downloadAndExtractZip(params.newProjectFiles, projectId);
				}

				return newProject.docUrl;
			} catch (error) {
				moduleLog.error('Error creating project from URL:', error);
				return null;
			} finally {
				setIsCreatingProject(false);
			}
		},
		[isAuthenticated, createProject],
	);

	const resolveViewFromHash = useCallback(
		(hashUrl: string) => {
			if (hashUrl === 'privacy-policy') {
				setShowPrivacy(true);
				return;
			}
			setShowPrivacy(false);

			if (hashUrl.startsWith('popout-viewer:')) {
				const projectId = hashUrl.replace('popout-viewer:', '');
				setIsPdfViewerWindow(true);
				setPdfViewerProjectId(projectId);
				return;
			}

			if (hashUrl?.includes('yjs:')) {
				const fragments = parseUrlFragments(hashUrl);
				if (fragments.yjsUrl && isValidYjsUrl(fragments.yjsUrl)) {
					setDocUrl(fragments.yjsUrl);
					setTargetDocId(fragments.docId || null);
					setTargetFilePath(fragments.filePath || null);
					if (isAuthenticated && !isInitializing) setCurrentView('editor');
					return;
				}
			}

			if (isValidYjsUrl(hashUrl)) {
				setDocUrl(hashUrl);
				if (isAuthenticated && !isInitializing) setCurrentView('editor');
				return;
			}

			if (isAuthenticated && !isInitializing) {
				setDocUrl(null);
				setTargetDocId(null);
				setTargetFilePath(null);
				setCurrentProjectId(null);
				sessionStorage.removeItem('currentProjectId');
				sessionStorage.removeItem('lastCheckedDocUrl');
				setCurrentView('projects');
			}
		},
		[isAuthenticated, isInitializing],
	);

	useEffect(() => {
		const hashUrl = window.location.hash.substring(1);

		const urlProjectParams = parseUrlProjectParams(hashUrl);
		if (urlProjectParams && isAuthenticated && !isInitializing) {
			if (processedProjectHashRef.current === hashUrl) {
				return;
			}
			processedProjectHashRef.current = hashUrl;

			createProjectFromUrl(urlProjectParams).then((createdDocUrl) => {
				if (createdDocUrl) {
					const hashSuffixes = [
						urlProjectParams.file
							? `file:${encodeURIComponent(urlProjectParams.file)}`
							: null,
						urlProjectParams.compile
							? `compile:${encodeURIComponent(urlProjectParams.compile)}`
							: null,
					].filter((part): part is string => part !== null);
					const finalHash =
						hashSuffixes.length > 0
							? `${createdDocUrl}&${hashSuffixes.join('&')}`
							: createdDocUrl;

					setDocUrl(createdDocUrl);
					setTargetFilePath(urlProjectParams.file || null);
					setCurrentView('editor');
					replaceHash(finalHash);
				} else {
					setCurrentView('projects');
					replaceHash('');
				}
			});
			return;
		}

		resolveViewFromHash(hashUrl);
	}, [
		isAuthenticated,
		isInitializing,
		resolveViewFromHash,
		createProjectFromUrl,
	]);

	useEffect(() => {
		const handlePopState = () => {
			resolveViewFromHash(window.location.hash.substring(1));
		};
		window.addEventListener('popstate', handlePopState);
		return () => window.removeEventListener('popstate', handlePopState);
	}, [resolveViewFromHash]);

	useEffect(() => {
		const checkAndCreateProject = async () => {
			if (isAuthenticated && !isInitializing && docUrl) {
				const lastCheckedUrl = sessionStorage.getItem('lastCheckedDocUrl');
				if (lastCheckedUrl === docUrl) {
					return;
				}

				sessionStorage.setItem('lastCheckedDocUrl', docUrl);

				try {
					const existingProjects = await getProjects();
					const existingProject = existingProjects.find(
						(p) => p.docUrl === docUrl,
					);

					if (existingProject) {
						setCurrentProjectId(existingProject.id);
						sessionStorage.setItem('currentProjectId', existingProject.id);
					} else {
						const metadata = await collabService.getDocumentMetadata(docUrl);

						if (metadata) {
							createProjectForDocument(
								docUrl,
								metadata.name || 'Untitled Project',
								metadata.description || '',
								metadata.type || 'latex',
							);
						} else {
							createProjectForDocument(
								docUrl,
								'Shared Document',
								'Shared via URL',
								'latex',
							);
						}
					}
				} catch (error) {
					moduleLog.error(
						'Error checking/creating project for shared document:',
						error,
					);
				}
			}
		};

		checkAndCreateProject();
	}, [
		isAuthenticated,
		isInitializing,
		docUrl,
		getProjects,
		createProjectForDocument,
	]);

	useEffect(() => {
		if (!isAuthenticated || isInitializing) return;

		const checkPendingShare = async () => {
			await shareTargetService.clearStaleShares();
			const share = await shareTargetService.getPendingShare();
			if (share) {
				setPendingShare(share);
			}
		};

		checkPendingShare();
	}, [isAuthenticated, isInitializing]);

	const handleAuthSuccess = () => {
		if (docUrl) {
			setCurrentView('editor');
		} else {
			setCurrentView('projects');
		}
	};

	const handleOpenProject = (
		projectDocUrl: string,
		_projectName?: string,
		_projectDescription?: string,
		projectId?: string,
	) => {
		setTargetDocId(null);
		setTargetFilePath(null);

		let finalUrl = projectDocUrl;
		if (projectDocUrl.includes('&')) {
			const fragments = parseUrlFragments(projectDocUrl);
			const baseDocUrl = fragments.yjsUrl;

			if (!isValidYjsUrl(baseDocUrl)) {
				moduleLog.error('Invalid document URL format:', baseDocUrl);
				return;
			}

			if (projectId) {
				setCurrentProjectId(projectId);
				sessionStorage.setItem('currentProjectId', projectId);
			}

			if (fragments.docId) setTargetDocId(fragments.docId);
			if (fragments.filePath) setTargetFilePath(fragments.filePath);

			setDocUrl(baseDocUrl);
			finalUrl = projectDocUrl;
		} else {
			if (!isValidYjsUrl(projectDocUrl)) {
				moduleLog.error('Invalid document URL format:', projectDocUrl);
				return;
			}

			if (projectId) {
				setCurrentProjectId(projectId);
				sessionStorage.setItem('currentProjectId', projectId);
			}

			setDocUrl(projectDocUrl);
			finalUrl = projectDocUrl;
		}

		pushHash(finalUrl);
		setCurrentView('editor');
	};

	const handleLogout = async () => {
		await logout();
		setDocUrl(null);
		setCurrentProjectId(null);
		setTargetDocId(null);
		setTargetFilePath(null);
		sessionStorage.removeItem('currentProjectId');
		sessionStorage.removeItem('lastCheckedDocUrl');
		replaceHash('');
		window.location.reload();
		setCurrentView('auth');
	};

	const handleBackToProjects = () => {
		setCurrentView('projects');
		setDocUrl(null);
		setCurrentProjectId(null);
		setTargetDocId(null);
		setTargetFilePath(null);
		sessionStorage.removeItem('currentProjectId');
		sessionStorage.removeItem('lastCheckedDocUrl');
		replaceHash('');
	};

	const handleClosePrivacy = () => {
		setShowPrivacy(false);
		replaceHash('');
	};

	const handleShareTargetOpen = (openDocUrl: string, projectId: string) => {
		if (pendingShare) {
			shareTargetService.clearPendingShare(pendingShare.id);
			setPendingShare(null);
		}
		setDocUrl(openDocUrl as YjsDocUrl);
		setCurrentProjectId(projectId);
		sessionStorage.setItem('currentProjectId', projectId);
		pushHash(openDocUrl);
		setCurrentView('editor');
	};

	const handleShareTargetClose = () => {
		if (pendingShare) {
			shareTargetService.clearPendingShare(pendingShare.id);
			setPendingShare(null);
		}
	};

	if (isInitializing || isCreatingProject) {
		return <LoadingScreen />;
	}

	if (isPdfViewerWindow && pdfViewerProjectId) {
		const PdfViewerWindow = lazy(() => import('../output/PopoutViewerWindow'));
		return (
			<Suspense fallback={<LoadingScreen />}>
				<PdfViewerWindow projectId={pdfViewerProjectId} />
			</Suspense>
		);
	}

	return (
		<>
			{!isAuthenticated ? (
				<AuthApp onAuthSuccess={handleAuthSuccess} />
			) : currentView === 'projects' ? (
				<ProjectApp onOpenProject={handleOpenProject} onLogout={handleLogout} />
			) : currentView === 'editor' && docUrl ? (
				<EditorApp
					docUrl={docUrl}
					onBackToProjects={handleBackToProjects}
					onLogout={handleLogout}
					targetDocId={targetDocId}
					targetFilePath={targetFilePath}
				/>
			) : (
				<ProjectApp onOpenProject={handleOpenProject} onLogout={handleLogout} />
			)}

			<PrivacyModal isOpen={showPrivacy} onClose={handleClosePrivacy} />

			<ShareTargetModal
				isOpen={!!pendingShare && isAuthenticated && !isInitializing}
				onClose={handleShareTargetClose}
				files={pendingShare?.files ?? []}
				onOpenProject={handleShareTargetOpen}
			/>
		</>
	);
};

export default AppRouter;
