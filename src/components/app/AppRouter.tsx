// src/components/app/AppRouter.tsx
import type React from "react";
import { useEffect, useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import { collabService } from "../../services/CollabService";
import type { YjsDocUrl } from "../../types/yjs";
import {
	buildUrlWithFragments,
	isValidYjsUrl,
	parseUrlFragments,
} from "../../types/yjs";
import AuthApp from "./AuthApp.tsx";
import EditorApp from "./EditorApp";
import LoadingScreen from "./LoadingScreen";
import ProjectApp from "./ProjectApp.tsx";

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

	// Check if a document URL was provided in the hash
	useEffect(() => {
		const hashUrl = window.location.hash.substring(1);

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

	// Handle auto-creation of projects for shared documents
	useEffect(() => {
		// Only process if authenticated and we have a document URL in the hash
		const checkAndCreateProject = async () => {
			if (isAuthenticated && !isInitializing && docUrl) {
				// Add this guard to prevent multiple runs with the same URL
				const lastCheckedUrl = sessionStorage.getItem("lastCheckedDocUrl");
				if (lastCheckedUrl === docUrl) {
					return; // Skip if we already checked this URL
				}

				// Store the current URL as checked
				sessionStorage.setItem("lastCheckedDocUrl", docUrl);

				// Check if this document already has a project associated with it
				try {
					const existingProjects = await getProjects();
					const existingProject = existingProjects.find(
						(p) => p.docUrl === docUrl,
					);

					if (existingProject) {
						// Already exists, store the project ID
						setCurrentProjectId(existingProject.id);
						sessionStorage.setItem("currentProjectId", existingProject.id);
					} else {
						// New document, try to get metadata using the CollabService
						const metadata = await collabService.getDocumentMetadata(docUrl);

						if (metadata) {
							createProjectForDocument(
								docUrl,
								metadata.name || "Untitled Project",
								metadata.description || "",
							);
						} else {
							// If no metadata, create with default values
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
			// Wait a moment for metadata to sync
			await new Promise((resolve) => setTimeout(resolve, 500));

			const project = await createProject({
				name,
				description,
				docUrl,
				tags: [],
				isFavorite: false,
			});

			// Set the current project ID for future updates
			setCurrentProjectId(project.id);
			sessionStorage.setItem("currentProjectId", project.id);

			return project;
		} catch (error) {
			console.error("Failed to create project for document:", error);
			throw error;
		}
	};

	// Handle authentication success
	const handleAuthSuccess = () => {
		if (docUrl) {
			setCurrentView("editor");
		} else {
			setCurrentView("projects");
		}
	};

	// Handle opening a project from the project manager
	const handleOpenProject = (
		projectDocUrl: string,
		_projectName?: string,
		_projectDescription?: string,
		projectId?: string,
	) => {
		// Clear previous targets
		setTargetDocId(null);
		setTargetFilePath(null);

		// Handle URLs that already have fragments
		let finalUrl = projectDocUrl;
		if (projectDocUrl.includes("&")) {
			const fragments = parseUrlFragments(projectDocUrl);
			const baseDocUrl = fragments.yjsUrl;

			// Validate URL format
			if (!isValidYjsUrl(baseDocUrl)) {
				console.error("Invalid document URL format:", baseDocUrl);
				return;
			}

			// Store the current project ID for later updates
			if (projectId) {
				setCurrentProjectId(projectId);
				sessionStorage.setItem("currentProjectId", projectId);
			}

			// Set fragment data for the editor to use
			if (fragments.docId) setTargetDocId(fragments.docId);
			if (fragments.filePath) setTargetFilePath(fragments.filePath);

			setDocUrl(baseDocUrl);
			finalUrl = projectDocUrl; // Keep the full URL with fragments
		} else {
			// Simple YJS URL without fragments
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

		// Update the browser URL
		window.location.hash = finalUrl;
		setCurrentView("editor");
	};

	// Handle logging out
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

	// Handle returning to projects from the editor
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

	// If still initializing auth, show a loading screen
	if (isInitializing) {
		return <LoadingScreen />;
	}

	// Determine which component to render based on current view and authentication status
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
				// If no docUrl is set but we're in editor view, go back to projects
				<ProjectApp onOpenProject={handleOpenProject} onLogout={handleLogout} />
			);
		default:
			return <AuthApp onAuthSuccess={handleAuthSuccess} />;
	}
};

export default AppRouter;
