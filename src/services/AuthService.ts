// src/services/AuthService.ts
import { type IDBPDatabase, openDB } from "idb";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import type { User } from "../types/auth";
import type { Project } from "../types/projects";
import { cleanupProjectDatabases } from "../utils/dbDeleteUtils";
import { fileSystemBackupService } from "./FileSystemBackupService";

const shouldAutoSync = (): boolean => {
	return localStorage.getItem("texlyre-auto-sync") === "true";
};

class AuthService {
	public db: IDBPDatabase | null = null;
	private readonly DB_NAME = "texlyre-auth";
	private readonly USER_STORE = "users";
	private readonly PROJECT_STORE = "projects";
	private readonly DB_VERSION = 1;
	private currentUser: User | null = null;

	async initialize(): Promise<void> {
		try {
			this.db = await openDB(this.DB_NAME, this.DB_VERSION, {
				upgrade: (db, _oldVersion, _newVersion) => {
					if (!db.objectStoreNames.contains(this.USER_STORE)) {
						const userStore = db.createObjectStore(this.USER_STORE, {
							keyPath: "id",
						});
						userStore.createIndex("username", "username", { unique: true });
						userStore.createIndex("email", "email", { unique: true });
					}

					if (!db.objectStoreNames.contains(this.PROJECT_STORE)) {
						const projectStore = db.createObjectStore(this.PROJECT_STORE, {
							keyPath: "id",
						});
						projectStore.createIndex("ownerId", "ownerId", { unique: false });
						projectStore.createIndex("tags", "tags", {
							unique: false,
							multiEntry: true,
						});
					}
				},
			});

			const userId = localStorage.getItem("texlyre-current-user");
			if (userId) {
				try {
					const user = await this.getUserById(userId);
					if (user) {
						this.currentUser = user;
					} else {
						localStorage.removeItem("texlyre-current-user");
					}
				} catch (error) {
					console.error("Error restoring user session:", error);
					localStorage.removeItem("texlyre-current-user");
				}
			}
		} catch (error) {
			console.error("Failed to initialize database:", error);
			throw error;
		}
	}

	async hashPassword(password: string): Promise<string> {
		const msgBuffer = new TextEncoder().encode(password);
		const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	}

	async register(
		username: string,
		password: string,
		email?: string,
	): Promise<User> {
		if (!this.db) await this.initialize();

		const existingUser = await this.db?.getFromIndex(
			this.USER_STORE,
			"username",
			username,
		);
		if (existingUser) {
			throw new Error("Username already exists");
		}

		if (email) {
			const existingEmail = await this.db?.getFromIndex(
				this.USER_STORE,
				"email",
				email,
			);
			if (existingEmail) {
				throw new Error("Email already exists");
			}
		}

		const passwordHash = await this.hashPassword(password);
		const userId = crypto.randomUUID();
		const now = Date.now();

		const newUser: User = {
			id: userId,
			username,
			passwordHash,
			email,
			createdAt: now,
			lastLogin: now,
		};

		await this.db?.put(this.USER_STORE, newUser);
		this.currentUser = newUser;
		localStorage.setItem("texlyre-current-user", userId);

		return newUser;
	}

	async login(username: string, password: string): Promise<User> {
		if (!this.db) await this.initialize();

		const user = await this.db?.getFromIndex(
			this.USER_STORE,
			"username",
			username,
		);
		if (!user) {
			throw new Error("User not found");
		}

		const passwordHash = await this.hashPassword(password);
		if (user.passwordHash !== passwordHash) {
			throw new Error("Invalid password");
		}

		user.lastLogin = Date.now();
		await this.db?.put(this.USER_STORE, user);

		this.currentUser = user;
		localStorage.setItem("texlyre-current-user", user.id);

		return user;
	}

	async logout(): Promise<void> {
		this.currentUser = null;
		localStorage.removeItem("texlyre-current-user");
	}

	async updateUser(user: User): Promise<User> {
		if (!this.db) await this.initialize();
		await this.db?.put(this.USER_STORE, user);

		if (this.currentUser && this.currentUser.id === user.id) {
			this.currentUser = user;
		}

		return user;
	}

	async updateUserColor(
		userId: string,
		color?: string,
		colorLight?: string,
	): Promise<User> {
		if (!this.db) await this.initialize();

		const user = await this.getUserById(userId);
		if (!user) {
			throw new Error("User not found");
		}

		const updatedUser: User = {
			...user,
			color,
			colorLight,
		};

		await this.updateUser(updatedUser);
		return updatedUser;
	}

	async getUserById(id: string): Promise<User | null> {
		if (!this.db) await this.initialize();
		return this.db?.get(this.USER_STORE, id);
	}

	async setCurrentUser(userId: string): Promise<User | null> {
		const user = await this.getUserById(userId);
		if (user) {
			this.currentUser = user;
			localStorage.setItem("texlyre-current-user", userId);
		}
		return user;
	}

	getCurrentUser(): User | null {
		return this.currentUser;
	}

	isAuthenticated(): boolean {
		return !!this.currentUser;
	}

	async verifyPassword(userId: string, password: string): Promise<boolean> {
		if (!this.db) await this.initialize();

		const user = await this.getUserById(userId);
		if (!user) return false;

		const passwordHash = await this.hashPassword(password);
		return user.passwordHash === passwordHash;
	}

	async updatePassword(userId: string, newPassword: string): Promise<User> {
		if (!this.db) await this.initialize();

		const user = await this.getUserById(userId);
		if (!user) throw new Error("User not found");

		const passwordHash = await this.hashPassword(newPassword);

		const updatedUser = {
			...user,
			passwordHash,
		};

		return this.updateUser(updatedUser);
	}

	private createNewDocumentUrl(
		projectName = "Untitled Project",
		projectDescription = "",
	): string {
		try {
			const projectId =
				Math.random().toString(36).substring(2, 15) +
				Math.random().toString(36).substring(2, 15);
			const dbName = `texlyre-project-${projectId}`;
			const yjsCollection = `${dbName}-yjs_metadata`;

			const ydoc = new Y.Doc();
			const persistence = new IndexeddbPersistence(yjsCollection, ydoc);

			ydoc.transact(() => {
				const ymap = ydoc.getMap("data");

				// Initialize with empty documents array
				ymap.set("documents", []);
				ymap.set("currentDocId", "");
				ymap.set("cursors", []);
				ymap.set("chatMessages", []);
				ymap.set("projectMetadata", {
					name: projectName,
					description: projectDescription,
				});
			});

			// Wait for persistence to sync
			setTimeout(() => {
				persistence.destroy();
				ydoc.destroy();
			}, 1000);

			return `yjs:${projectId}`;
		} catch (error) {
			console.error("Error creating new document:", error);
			throw new Error("Failed to create document for project");
		}
	}

	async createProject(
		project: Omit<Project, "id" | "createdAt" | "updatedAt" | "ownerId">,
		requireAuth = true,
	): Promise<Project> {
		if (!this.db) await this.initialize();
		if (requireAuth && !this.currentUser) {
			throw new Error("User not authenticated");
		}

		const docUrl =
			project.docUrl ||
			this.createNewDocumentUrl(project.name, project.description);

		const now = Date.now();
		const newProject: Project = {
			...project,
			docUrl,
			id: crypto.randomUUID(),
			createdAt: now,
			updatedAt: now,
			ownerId: this.currentUser.id,
		};

		await this.db?.put(this.PROJECT_STORE, newProject);
		if (shouldAutoSync()) {
			fileSystemBackupService.synchronize(newProject.id).catch(console.error);
		}

		return newProject;
	}

	async updateProject(project: Project): Promise<Project> {
		if (!this.db) await this.initialize();

		const existingProject = await this.db?.get(this.PROJECT_STORE, project.id);
		if (!existingProject) {
			throw new Error("Project not found");
		}

		if (existingProject.ownerId !== this.currentUser?.id) {
			throw new Error("You do not have permission to update this project");
		}

		const updatedProject: Project = {
			...project,
			updatedAt: Date.now(),
		};

		await this.db?.put(this.PROJECT_STORE, updatedProject);
		if (shouldAutoSync()) {
			fileSystemBackupService.synchronize(project.id).catch(console.error);
		}

		return updatedProject;
	}

	async createOrUpdateProject(
		project: Project,
		requireAuth = true,
	): Promise<Project> {
		if (!this.db) await this.initialize();

		if (requireAuth && !this.currentUser) {
			throw new Error("User not authenticated");
		}

		if (project.id) {
			return this.updateProject({
				...project,
				id: project.id,
				ownerId: this.currentUser.id,
			});
		}
		return this.createProject({
			...project,
			docUrl: project.docUrl || this.createNewDocumentUrl(),
		});
	}

	async deleteProject(id: string): Promise<void> {
		if (!this.db) await this.initialize();

		const project = await this.db?.get(this.PROJECT_STORE, id);
		if (!project) {
			throw new Error("Project not found");
		}

		if (project.ownerId !== this.currentUser?.id) {
			throw new Error("You do not have permission to delete this project");
		}

		await this.db?.delete(this.PROJECT_STORE, id);
		await cleanupProjectDatabases(project);

		if (shouldAutoSync()) {
			fileSystemBackupService.synchronize().catch(console.error);
		}
	}

	async getProjectById(id: string): Promise<Project | null> {
		if (!this.db) await this.initialize();
		return this.db?.get(this.PROJECT_STORE, id);
	}

	async getProjectsByUser(userId?: string): Promise<Project[]> {
		if (!this.db) await this.initialize();

		const targetUserId = userId || this.currentUser?.id;
		if (!targetUserId) {
			return [];
		}

		const tx = this.db?.transaction(this.PROJECT_STORE, "readonly");
		const index = tx.store.index("ownerId");
		return index.getAll(targetUserId);
	}

	async getProjects(): Promise<Project[]> {
		return this.getProjectsByUser();
	}

	async getProjectsByTag(tag: string): Promise<Project[]> {
		if (!this.db) await this.initialize();

		if (!this.currentUser) {
			return [];
		}

		const tx = this.db?.transaction(this.PROJECT_STORE, "readonly");
		const index = tx.store.index("tags");
		const projects = await index.getAll(tag);

		return projects.filter(
			(project) => project.ownerId === this.currentUser?.id,
		);
	}

	async searchProjects(query: string): Promise<Project[]> {
		if (!this.db) await this.initialize();

		if (!this.currentUser) {
			return [];
		}

		const tx = this.db?.transaction(this.PROJECT_STORE, "readonly");
		const projects: Project[] = await tx.store.getAll();

		const lowerQuery = query.toLowerCase();
		return projects.filter(
			(project) =>
				project.ownerId === this.currentUser?.id &&
				(project.name.toLowerCase().includes(lowerQuery) ||
					project.description.toLowerCase().includes(lowerQuery) ||
					project.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))),
		);
	}

	async toggleFavorite(projectId: string): Promise<Project> {
		if (!this.db) await this.initialize();

		const project = await this.db?.get(this.PROJECT_STORE, projectId);
		if (!project) {
			throw new Error("Project not found");
		}

		if (project.ownerId !== this.currentUser?.id) {
			throw new Error("You do not have permission to modify this project");
		}

		const updatedProject: Project = {
			...project,
			isFavorite: !project.isFavorite,
			updatedAt: Date.now(),
		};

		await this.db?.put(this.PROJECT_STORE, updatedProject);
		return updatedProject;
	}
}

export const authService = new AuthService();
