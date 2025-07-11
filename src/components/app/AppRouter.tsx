// src/components/app/AppRouter.tsx
import type React from "react";
import { useEffect, useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import { collabService } from "../../services/CollabService";
import { fileStorageService } from "../../services/FileStorageService";
import type { YjsDocUrl } from "../../types/yjs";
import {
	buildUrlWithFragments,
	isValidYjsUrl,
	parseUrlFragments,
} from "../../types/yjs";
import { batchExtractZip } from "../../utils/zipUtils";
import AuthApp from "./AuthApp.tsx";
import EditorApp from "./EditorApp";
import LoadingScreen from "./LoadingScreen";
import ProjectApp from "./ProjectApp.tsx";

interface UrlProjectParams {
	newProjectName?: string;
	newProjectDescription?: string;
	newProjectTags?: string;
	files?: string;
}

const AppRouter: React.FC = () => {
	const {
		isAuthenticated,
		isInitializing,
		logout,
		createProject,
		getProjects,
	} = useAuth();

	const [currentView, setCurrentView] = useState<
		"auth" | "projects" | "editor"
	>("auth");
	const [docUrl, setDocUrl] = useState<YjsDocUrl | null>(null);
	const [_currentProjectId, setCurrentProjectId] = useState<string | null>(
		null,
	);
	const [targetDocId, setTargetDocId] = useState<string | null>(null);
	const [targetFilePath, setTargetFilePath] = useState<string | null>(null);
	const [isCreatingProject, setIsCreatingProject] = useState(false);

	const parseUrlProjectParams = (hashUrl: string): UrlProjectParams | null => {
		try {
			const params: UrlProjectParams = {};
			const parts = hashUrl.split("&");

			for (const part of parts) {
				if (part.startsWith("newProjectName:")) {
					params.newProjectName = decodeURIComponent(part.slice(15));
				} else if (part.startsWith("newProjectDescription:")) {
					params.newProjectDescription = decodeURIComponent(part.slice(22));
				} else if (part.startsWith("newProjectTags:")) {
					params.newProjectTags = decodeURIComponent(part.slice(15));
				} else if (part.startsWith("files:")) {
					params.files = decodeURIComponent(part.slice(6));
				}
			}

			return params.newProjectName ? params : null;
		} catch (error) {
			console.error("Error parsing URL project params:", error);
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
			const zipFile = new File([zipBlob], "template.zip", {
				type: "application/zip",
			});

			await fileStorageService.initialize(`yjs:${projectId}`);

			const { files, directories } = await batchExtractZip(zipFile, "/");
			const allFiles = [...directories, ...files];

			await fileStorageService.batchStoreFiles(allFiles, {
				showConflictDialog: false,
				preserveTimestamp: false,
			});
		} catch (error) {
			console.error("Error downloading and extracting zip:", error);
		}
	};

	const createProjectFromUrl = async (
		params: UrlProjectParams,
	): Promise<string | null> => {
		if (!isAuthenticated || !params.newProjectName) return null;

		setIsCreatingProject(true);

		try {
			const newProject = await createProject({
				name: params.newProjectName,
				description: params.newProjectDescription || "",
				tags: params.newProjectTags.split(",") || [],
				isFavorite: false,
			});

			const projectId = newProject.docUrl.startsWith("yjs:")
				? newProject.docUrl.slice(4)
				: newProject.docUrl;

			if (params.files) {
				await downloadAndExtractZip(params.files, projectId);
			}

			return newProject.docUrl;
		} catch (error) {
			console.error("Error creating project from URL:", error);
			return null;
		} finally {
			setIsCreatingProject(false);
		}
	};

	useEffect(() => {
		const hashUrl = window.location.hash.substring(1);

		const urlProjectParams = parseUrlProjectParams(hashUrl);
		if (urlProjectParams && isAuthenticated && !isInitializing) {
			createProjectFromUrl(urlProjectParams).then((createdDocUrl) => {
				if (createdDocUrl) {
					setDocUrl(createdDocUrl);
					setCurrentView("editor");
					window.location.hash = createdDocUrl;
				} else {
					setCurrentView("projects");
					window.location.hash = "";
				}
			});
			return;
		}

		if (hashUrl?.includes("yjs:")) {
			const fragments = parseUrlFragments(hashUrl);

			if (fragments.yjsUrl && isValidYjsUrl(fragments.yjsUrl)) {
				setDocUrl(fragments.yjsUrl);
				setTargetDocId(fragments.docId || null);
				setTargetFilePath(fragments.filePath || null);

				if (isAuthenticated && !isInitializing) {
					setCurrentView("editor");
				}
			}
		} else if (isValidYjsUrl(hashUrl)) {
			setDocUrl(hashUrl);
			if (isAuthenticated && !isInitializing) {
				setCurrentView("editor");
			}
		} else if (isAuthenticated && !isInitializing && !hashUrl) {
			setCurrentView("projects");
		}
	}, [isAuthenticated, isInitializing]);

	useEffect(() => {
		const checkAndCreateProject = async () => {
			if (isAuthenticated && !isInitializing && docUrl) {
				const lastCheckedUrl = sessionStorage.getItem("lastCheckedDocUrl");
				if (lastCheckedUrl === docUrl) {
					return;
				}

				sessionStorage.setItem("lastCheckedDocUrl", docUrl);

				try {
					const existingProjects = await getProjects();
					const existingProject = existingProjects.find(
						(p) => p.docUrl === docUrl,
					);

					if (existingProject) {
						setCurrentProjectId(existingProject.id);
						sessionStorage.setItem("currentProjectId", existingProject.id);
					} else {
						const metadata = await collabService.getDocumentMetadata(docUrl);

						if (metadata) {
							createProjectForDocument(
								docUrl,
								metadata.name || "Untitled Project",
								metadata.description || "",
							);
						} else {
							createProjectForDocument(
								docUrl,
								"Shared Document",
								"Shared via URL",
							);
						}
					}
				} catch (error) {
					console.error(
						"Error checking/creating project for shared document:",
						error,
					);
				}
			}
		};

		checkAndCreateProject();
	}, [isAuthenticated, isInitializing, docUrl, createProject, getProjects]);

	const createProjectForDocument = async (
		docUrl: string,
		name: string,
		description: string,
	) => {
		try {
			await new Promise((resolve) => setTimeout(resolve, 500));

			const project = await createProject({
				name,
				description,
				docUrl,
				tags: [],
				isFavorite: false,
			});

			setCurrentProjectId(project.id);
			sessionStorage.setItem("currentProjectId", project.id);

			return project;
		} catch (error) {
			console.error("Failed to create project for document:", error);
			throw error;
		}
	};

	const handleAuthSuccess = () => {
		if (docUrl) {
			setCurrentView("editor");
		} else {
			setCurrentView("projects");
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
		if (projectDocUrl.includes("&")) {
			const fragments = parseUrlFragments(projectDocUrl);
			const baseDocUrl = fragments.yjsUrl;

			if (!isValidYjsUrl(baseDocUrl)) {
				console.error("Invalid document URL format:", baseDocUrl);
				return;
			}

			if (projectId) {
				setCurrentProjectId(projectId);
				sessionStorage.setItem("currentProjectId", projectId);
			}

			if (fragments.docId) setTargetDocId(fragments.docId);
			if (fragments.filePath) setTargetFilePath(fragments.filePath);

			setDocUrl(baseDocUrl);
			finalUrl = projectDocUrl;
		} else {
			if (!isValidYjsUrl(projectDocUrl)) {
				console.error("Invalid document URL format:", projectDocUrl);
				return;
			}

			if (projectId) {
				setCurrentProjectId(projectId);
				sessionStorage.setItem("currentProjectId", projectId);
			}

			setDocUrl(projectDocUrl);
			finalUrl = projectDocUrl;
		}

		window.location.hash = finalUrl;
		setCurrentView("editor");
	};

	const handleLogout = async () => {
		await logout();
		setCurrentView("auth");
		setDocUrl(null);
		setCurrentProjectId(null);
		setTargetDocId(null);
		setTargetFilePath(null);
		sessionStorage.removeItem("currentProjectId");
		sessionStorage.removeItem("lastCheckedDocUrl");
	};

	const handleBackToProjects = () => {
		setCurrentView("projects");
		setDocUrl(null);
		setCurrentProjectId(null);
		setTargetDocId(null);
		setTargetFilePath(null);
		sessionStorage.removeItem("currentProjectId");
		sessionStorage.removeItem("lastCheckedDocUrl");
		window.location.hash = "";
	};

	if (isInitializing || isCreatingProject) {
		return <LoadingScreen />;
	}

	if (!isAuthenticated) {
		return <AuthApp onAuthSuccess={handleAuthSuccess} />;
	}

	switch (currentView) {
		case "projects":
			return (
				<ProjectApp onOpenProject={handleOpenProject} onLogout={handleLogout} />
			);
		case "editor":
			return docUrl ? (
				<EditorApp
					docUrl={docUrl}
					onBackToProjects={handleBackToProjects}
					onLogout={handleLogout}
					targetDocId={targetDocId}
					targetFilePath={targetFilePath}
				/>
			) : (
				<ProjectApp onOpenProject={handleOpenProject} onLogout={handleLogout} />
			);
		default:
			return <AuthApp onAuthSuccess={handleAuthSuccess} />;
	}
};

export default AppRouter;
