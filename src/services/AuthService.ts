// src/services/AuthService.ts
import { t } from '@/i18n';
import { type IDBPDatabase, openDB } from 'idb';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import type { User, UserRole } from '../types/auth';
import type { Project } from '../types/projects';
import { cleanupProjectDatabases } from '../utils/dbDeleteUtils';
import { fileSystemBackupService } from './FileSystemBackupService';

const shouldAutoSync = (): boolean => {
	return localStorage.getItem('texlyre-auto-sync') === 'true';
};

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

class AuthService {
	public db: IDBPDatabase | null = null;
	private readonly DB_NAME = 'texlyre-auth';
	private readonly USER_STORE = 'users';
	private readonly PROJECT_STORE = 'projects';
	private readonly DB_VERSION = 2;
	private currentUser: User | null = null;

	async initialize(): Promise<void> {
		try {
			this.db = await openDB(this.DB_NAME, this.DB_VERSION, {
				upgrade: (db, oldVersion, _newVersion) => {
					if (!db.objectStoreNames.contains(this.USER_STORE)) {
						const userStore = db.createObjectStore(this.USER_STORE, {
							keyPath: 'id',
						});
						userStore.createIndex('username', 'username', { unique: false });
						userStore.createIndex('email', 'email', { unique: false });
						userStore.createIndex('sessionId', 'sessionId', { unique: false });
					}

					if (!db.objectStoreNames.contains(this.PROJECT_STORE)) {
						const projectStore = db.createObjectStore(this.PROJECT_STORE, {
							keyPath: 'id',
						});
						projectStore.createIndex('ownerId', 'ownerId', { unique: false });
						projectStore.createIndex('tags', 'tags', {
							unique: false,
							multiEntry: true,
						});
					}
				},
			});

			// Seed default admin account if no users exist
			await this.seedDefaultAdmin();

			const userId = localStorage.getItem('texlyre-current-user');
			if (userId) {
				try {
					const user = await this.getUserById(userId);
					if (user) {
						this.currentUser = user;
						console.log(`[AuthService] Restored user session: ${user.username} (role: ${user.role || 'user'})`);
					} else {
						console.log(`[AuthService] User not found: ${userId}`);
						localStorage.removeItem('texlyre-current-user');
					}
				} catch (error) {
					console.error('Error restoring user session:', error);
					localStorage.removeItem('texlyre-current-user');
				}
			}
		} catch (error) {
			console.error('Failed to initialize database:', error);
			throw error;
		}
	}

	private async seedDefaultAdmin(): Promise<void> {
		if (!this.db) return;

		try {
			const tx = this.db.transaction(this.USER_STORE, 'readonly');
			const allUsers = await tx.store.getAll();

			if (allUsers.length === 0) {
				const passwordHash = await this.hashPassword(DEFAULT_ADMIN_PASSWORD);
				const adminUser: User = {
					id: crypto.randomUUID(),
					username: DEFAULT_ADMIN_USERNAME,
					passwordHash,
					role: 'admin',
					createdAt: Date.now(),
					lastLogin: undefined,
					color: this.generateRandomColor(false),
					colorLight: this.generateRandomColor(true),
				};

				await this.db.put(this.USER_STORE, adminUser);
				console.log('[AuthService] Default admin account created (username: admin, password: admin). Please change the password after first login.');
			}
		} catch (error) {
			console.error('Error seeding default admin:', error);
		}
	}

	async hashPassword(password: string): Promise<string> {
		const msgBuffer = new TextEncoder().encode(password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	isAdmin(user?: User | null): boolean {
		const target = user || this.currentUser;
		return target?.role === 'admin';
	}

	isGuestUser(_user: User | null): boolean {
		return false;
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

	async login(username: string, password: string): Promise<User> {
		if (!this.db) await this.initialize();

		const user = await this.db?.getFromIndex(
			this.USER_STORE,
			'username',
			username,
		);
		if (!user) {
			throw new Error(t('User not found'));
		}

		const passwordHash = await this.hashPassword(password);
		if (user.passwordHash !== passwordHash) {
			throw new Error(t('Invalid password'));
		}

		// Ensure role is set for legacy users
		if (!user.role) {
			user.role = 'user';
		}

		user.lastLogin = Date.now();
		await this.db?.put(this.USER_STORE, user);

		this.currentUser = user;
		localStorage.setItem('texlyre-current-user', user.id);

		return user;
	}

	async logout(): Promise<void> {
		this.currentUser = null;
		localStorage.removeItem('texlyre-current-user');
	}

	// Admin-only: create a new user
	async adminCreateUser(
		username: string,
		password: string,
		email?: string,
		role: UserRole = 'user',
	): Promise<User> {
		if (!this.db) await this.initialize();

		if (!this.isAdmin()) {
			throw new Error(t('Only administrators can create users'));
		}

		const existingUser = await this.db?.getFromIndex(
			this.USER_STORE,
			'username',
			username,
		);
		if (existingUser) {
			throw new Error(t('Username already exists'));
		}

		if (email) {
			const existingEmail = await this.db?.getFromIndex(
				this.USER_STORE,
				'email',
				email,
			);
			if (existingEmail) {
				throw new Error(t('Email already exists'));
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
			role,
			createdAt: now,
			lastLogin: undefined,
			color: this.generateRandomColor(false),
			colorLight: this.generateRandomColor(true),
		};

		await this.db?.put(this.USER_STORE, newUser);
		console.log(`[AuthService] Admin created user: ${username} (role: ${role})`);
		return newUser;
	}

	// Admin-only: delete a user
	async adminDeleteUser(userId: string): Promise<void> {
		if (!this.db) await this.initialize();

		if (!this.isAdmin()) {
			throw new Error(t('Only administrators can delete users'));
		}

		if (userId === this.currentUser?.id) {
			throw new Error(t('Cannot delete your own account'));
		}

		const user = await this.getUserById(userId);
		if (!user) {
			throw new Error(t('User not found'));
		}

		// Clean up user's projects
		const userProjects = await this.getProjectsByUser(userId);
		for (const project of userProjects) {
			try {
				await cleanupProjectDatabases(project);
				await this.db?.delete(this.PROJECT_STORE, project.id);
			} catch (error) {
				console.warn(`Failed to cleanup project ${project.id}:`, error);
			}
		}

		await this.db?.delete(this.USER_STORE, userId);
		console.log(`[AuthService] Admin deleted user: ${user.username} (${userId})`);
	}

	// Admin-only: get all users
	async adminGetAllUsers(): Promise<User[]> {
		if (!this.db) await this.initialize();

		if (!this.isAdmin()) {
			throw new Error(t('Only administrators can view all users'));
		}

		const tx = this.db?.transaction(this.USER_STORE, 'readonly');
		return tx.store.getAll();
	}

	// Admin-only: reset a user's password
	async adminResetPassword(userId: string, newPassword: string): Promise<User> {
		if (!this.db) await this.initialize();

		if (!this.isAdmin()) {
			throw new Error(t('Only administrators can reset passwords'));
		}

		const user = await this.getUserById(userId);
		if (!user) throw new Error(t('User not found'));

		const passwordHash = await this.hashPassword(newPassword);
		const updatedUser = { ...user, passwordHash };
		await this.db?.put(this.USER_STORE, updatedUser);

		console.log(`[AuthService] Admin reset password for user: ${user.username}`);
		return updatedUser;
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
			throw new Error(t('User not found'));
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
			localStorage.setItem('texlyre-current-user', userId);
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
		if (!user) throw new Error(t('User not found'));

		const passwordHash = await this.hashPassword(newPassword);

		const updatedUser = {
			...user,
			passwordHash,
		};

		return this.updateUser(updatedUser);
	}

	private createNewDocumentUrl(
		projectName = 'Untitled Project',
		projectDescription = '',
		projectType?: 'latex' | 'typst',
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
				const ymap = ydoc.getMap('data');

				ymap.set('documents', []);
				ymap.set('currentDocId', '');
				ymap.set('cursors', []);
				ymap.set('chatMessages', []);
				ymap.set('projectMetadata', {
					name: projectName,
					description: projectDescription,
					type: projectType || 'latex',
				});
			});

			setTimeout(() => {
				persistence.destroy();
				ydoc.destroy();
			}, 1000);

			return `yjs:${projectId}`;
		} catch (error) {
			console.error('Error creating new document:', error);
			throw new Error('Failed to create document for project');
		}
	}

	async createProject(
		project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>,
		requireAuth = true,
	): Promise<Project> {
		if (!this.db) await this.initialize();
		if (requireAuth && !this.currentUser) {
			throw new Error(t('User not authenticated'));
		}

		const docUrl =
			project.docUrl ||
			this.createNewDocumentUrl(project.name, project.description, project.type);

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
			throw new Error(t('Project not found'));
		}

		if (existingProject.ownerId !== this.currentUser?.id) {
			throw new Error(t('You do not have permission to update this project'));
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
			throw new Error(t('User not authenticated'));
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
			throw new Error(t('Project not found'));
		}

		if (project.ownerId !== this.currentUser?.id) {
			throw new Error(t('You do not have permission to delete this project'));
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

		const tx = this.db?.transaction(this.PROJECT_STORE, 'readonly');
		const index = tx.store.index('ownerId');
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

		const tx = this.db?.transaction(this.PROJECT_STORE, 'readonly');
		const index = tx.store.index('tags');
		const projects = await index.getAll(tag);

		return projects.filter(
			(project) => project.ownerId === this.currentUser?.id,
		);
	}

	async getProjectsByType(type: 'latex' | 'typst'): Promise<Project[]> {
		if (!this.db) await this.initialize();

		if (!this.currentUser) {
			return [];
		}
		const tx = this.db?.transaction(this.PROJECT_STORE, 'readonly');
		const projects: Project[] = await tx.store.getAll();

		return projects.filter(
			(project) => project.ownerId === this.currentUser?.id && project.type === type,
		);
	}

	async searchProjects(query: string): Promise<Project[]> {
		if (!this.db) await this.initialize();

		if (!this.currentUser) {
			return [];
		}

		const tx = this.db?.transaction(this.PROJECT_STORE, 'readonly');
		const projects: Project[] = await tx.store.getAll();

		const lowerQuery = query.toLowerCase();
		return projects.filter(
			(project) =>
				project.ownerId === this.currentUser?.id &&
				(project.name.toLowerCase().includes(lowerQuery) ||
					project.description.toLowerCase().includes(lowerQuery) ||
					project.type.toLowerCase().includes(lowerQuery) ||
					project.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))),
		);
	}

	async toggleFavorite(projectId: string): Promise<Project> {
		if (!this.db) await this.initialize();

		const project = await this.db?.get(this.PROJECT_STORE, projectId);
		if (!project) {
			throw new Error(t('Project not found'));
		}

		if (project.ownerId !== this.currentUser?.id) {
			throw new Error(t('You do not have permission to modify this project'));
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