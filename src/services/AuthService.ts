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
						userStore.createIndex("username", "username", { unique: false });
						userStore.createIndex("email", "email", { unique: false });
						userStore.createIndex("sessionId", "sessionId", { unique: false });
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
						if (this.isGuestUser(user) && this.isGuestExpired(user)) {
							console.log(`[AuthService] Guest session expired: ${userId}`);
							await this.cleanupExpiredGuest(user);
							localStorage.removeItem("texlyre-current-user");
						} else {
							this.currentUser = user;
							console.log(`[AuthService] Restored user session: ${user.username} (${this.isGuestUser(user) ? 'guest' : 'full'})`);
						}
					} else {
						console.log(`[AuthService] User not found: ${userId}`);
						localStorage.removeItem("texlyre-current-user");
					}
				} catch (error) {
					console.error("Error restoring user session:", error);
					localStorage.removeItem("texlyre-current-user");
				}
			}

			// Run cleanup on initialization
			this.cleanupExpiredGuests();
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

	generateSessionId(): string {
		return `guest_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
	}

	isGuestUser(user: User | null): boolean {
		return !!(user?.isGuest);
	}

	isGuestExpired(user: User | null): boolean {
		if (!user || !this.isGuestUser(user) || !user.expiresAt) return false;
		return Date.now() > user.expiresAt;
	}

	async createGuestAccount(): Promise<User> {
		if (!this.db) {
			console.log("[AuthService] Database not initialized, initializing...");
			await this.initialize();
		}

		// Clean up any existing expired guests first
		await this.cleanupExpiredGuests();

		const sessionId = this.generateSessionId();
		const userId = `guest_${crypto.randomUUID()}`;
		const now = Date.now();
		const expiresAt = now + (24 * 60 * 60 * 1000);

		const guestUser: User = {
			id: userId,
			username: `Guest User`,
			passwordHash: await this.hashPassword(sessionId),
			isGuest: true,
			sessionId,
			expiresAt,
			createdAt: now,
			lastLogin: now,
			color: this.generateRandomColor(false),
			colorLight: this.generateRandomColor(true),
		};

		try {
			console.log(`[AuthService] Creating guest user with ID: ${userId}`);
			await this.db?.put(this.USER_STORE, guestUser);

			// Verify the user was created
			const verifyUser = await this.db?.get(this.USER_STORE, userId);
			if (!verifyUser) {
				throw new Error("Failed to verify guest user creation");
			}

			this.currentUser = guestUser;
			localStorage.setItem("texlyre-current-user", userId);

			console.log(`[AuthService] Successfully created guest account: ${sessionId}`);
			return guestUser;
		} catch (error) {
			console.error("Failed to create guest account:", error);
			throw new Error("Failed to create guest session. Please refresh the page and try again.");
		}
	}

	async upgradeGuestAccount(
		username: string,
		password: string,
		email?: string,
	): Promise<User> {
		if (!this.db) await this.initialize();
		if (!this.currentUser || !this.isGuestUser(this.currentUser)) {
			throw new Error("No guest account to upgrade");
		}

		// Check for existing non-guest users only
		const existingUser = await this.db?.getFromIndex(
			this.USER_STORE,
			"username",
			username,
		);
		if (existingUser && !this.isGuestUser(existingUser)) {
			throw new Error("Username already exists");
		}

		if (email) {
			const existingEmail = await this.db?.getFromIndex(
				this.USER_STORE,
				"email",
				email,
			);
			if (existingEmail && !this.isGuestUser(existingEmail)) {
				throw new Error("Email already exists");
			}
		}

		const passwordHash = await this.hashPassword(password);
		const now = Date.now();
		const oldGuestId = this.currentUser.id;

		// Create a completely new user ID for the upgraded account
		const newUserId = crypto.randomUUID();

		const upgradedUser: User = {
			id: newUserId,
			username,
			email,
			passwordHash,
			createdAt: this.currentUser.createdAt,
			lastLogin: now,
			color: this.currentUser.color,
			colorLight: this.currentUser.colorLight,
			// Explicitly remove guest properties
			isGuest: undefined,
			sessionId: undefined,
			expiresAt: undefined,
		};

		// Transfer ownership of all guest projects to the new user
		await this.transferGuestProjects(oldGuestId, newUserId);

		// Add the new user
		await this.db?.put(this.USER_STORE, upgradedUser);

		// Remove the old guest account
		await this.db?.delete(this.USER_STORE, oldGuestId);

		this.currentUser = upgradedUser;
		localStorage.setItem("texlyre-current-user", newUserId);

		console.log(`[AuthService] Upgraded guest account ${oldGuestId} to full account: ${username} (${newUserId})`);
		return upgradedUser;
	}

	private async transferGuestProjects(oldUserId: string, newUserId: string): Promise<void> {
		if (!this.db) return;

		try {
			const guestProjects = await this.getProjectsByUser(oldUserId);

			for (const project of guestProjects) {
				const updatedProject = {
					...project,
					ownerId: newUserId,
					updatedAt: Date.now(),
				};
				await this.db.put(this.PROJECT_STORE, updatedProject);
			}

			console.log(`[AuthService] Transferred ${guestProjects.length} projects from guest ${oldUserId} to user ${newUserId}`);
		} catch (error) {
			console.error("Error transferring guest projects:", error);
		}
	}

	async cleanupExpiredGuests(): Promise<void> {
		if (!this.db) return;

		try {
			const tx = this.db.transaction([this.USER_STORE, this.PROJECT_STORE], "readwrite");
			const userStore = tx.objectStore("users");

			const allUsers = await userStore.getAll();
			const expiredGuests = allUsers.filter(user =>
				this.isGuestUser(user) && this.isGuestExpired(user)
			);

			for (const expiredGuest of expiredGuests) {
				await this.cleanupExpiredGuest(expiredGuest);
			}

			console.log(`[AuthService] Cleaned up ${expiredGuests.length} expired guest accounts`);
		} catch (error) {
			console.error("Error during guest cleanup:", error);
		}
	}

	async cleanupExpiredGuest(guestUser: User): Promise<void> {
		if (!this.db) return;

		try {
			console.log(`[AuthService] Cleaning up guest: ${guestUser.id}`);

			// Get guest projects
			const guestProjects = await this.getProjectsByUser(guestUser.id);
			console.log(`[AuthService] Found ${guestProjects.length} guest projects to cleanup`);

			// Clean up project databases first
			for (const project of guestProjects) {
				try {
					await cleanupProjectDatabases(project);
				} catch (error) {
					console.warn(`Failed to cleanup project database for ${project.id}:`, error);
				}
			}

			// Remove projects from database
			if (guestProjects.length > 0) {
				const projectTx = this.db.transaction(this.PROJECT_STORE, "readwrite");
				for (const project of guestProjects) {
					try {
						await projectTx.objectStore("projects").delete(project.id);
					} catch (error) {
						console.warn(`Failed to delete project ${project.id}:`, error);
					}
				}
			}

			// Remove user from database
			const userTx = this.db.transaction(this.USER_STORE, "readwrite");
			await userTx.objectStore("users").delete(guestUser.id);

			console.log(`[AuthService] Successfully cleaned up guest: ${guestUser.id}`);
		} catch (error) {
			console.error(`Error cleaning up guest ${guestUser.id}:`, error);
			// Don't rethrow - cleanup failures shouldn't block other operations
		}
	}

	private generateRandomColor(isLight: boolean): string {
		const hue = Math.floor(Math.random() * 360);
		const saturation = isLight
			? 60 + Math.floor(Math.random() * 20)
			: 70 + Math.floor(Math.random() * 30);
		const lightness = isLight
			? 65 + Math.floor(Math.random() * 20)
			: 45 + Math.floor(Math.random() * 25);

		const hslToHex = (h: number, s: number, l: number): string => {
			const sNorm = s / 100;
			const lNorm = l / 100;
			const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
			const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
			const m = lNorm - c / 2;

			let r = 0;
			let g = 0;
			let b = 0;
			if (0 <= h && h < 60) {
				r = c;
				g = x;
				b = 0;
			} else if (60 <= h && h < 120) {
				r = x;
				g = c;
				b = 0;
			} else if (120 <= h && h < 180) {
				r = 0;
				g = c;
				b = x;
			} else if (180 <= h && h < 240) {
				r = 0;
				g = x;
				b = c;
			} else if (240 <= h && h < 300) {
				r = x;
				g = 0;
				b = c;
			} else if (300 <= h && h < 360) {
				r = c;
				g = 0;
				b = x;
			}

			const toHex = (n: number) => {
				const hex = Math.round((n + m) * 255).toString(16);
				return hex.length === 1 ? `0${hex}` : hex;
			};

			return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
		};

		return hslToHex(hue, saturation, lightness);
	}

	async register(
		username: string,
		password: string,
		email?: string,
	): Promise<User> {
		if (!this.db) await this.initialize();

		// Check for existing non-guest users only
		const existingUser = await this.db?.getFromIndex(
			this.USER_STORE,
			"username",
			username,
		);
		if (existingUser && !this.isGuestUser(existingUser)) {
			throw new Error("Username already exists");
		}

		if (email) {
			const existingEmail = await this.db?.getFromIndex(
				this.USER_STORE,
				"email",
				email,
			);
			if (existingEmail && !this.isGuestUser(existingEmail)) {
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
		if (!user || this.isGuestUser(user)) {
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
		// If logging out a guest, clean up their data immediately
		if (this.currentUser && this.isGuestUser(this.currentUser)) {
			await this.cleanupExpiredGuest(this.currentUser);
		}

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

				ymap.set("documents", []);
				ymap.set("currentDocId", "");
				ymap.set("cursors", []);
				ymap.set("chatMessages", []);
				ymap.set("projectMetadata", {
					name: projectName,
					description: projectDescription,
				});
			});

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

		if (shouldAutoSync() && !this.isGuestUser(this.currentUser)) {
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

		if (shouldAutoSync() && !this.isGuestUser(this.currentUser)) {
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

		if (shouldAutoSync() && !this.isGuestUser(this.currentUser)) {
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