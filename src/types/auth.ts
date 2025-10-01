// src/types/auth.ts
import type { Project } from "./projects";

export interface AuthContextType {
	user: User | null;
	isAuthenticated: boolean;
	isInitializing: boolean;
	login: (username: string, password: string) => Promise<User>;
	register: (
		username: string,
		password: string,
		email?: string,
	) => Promise<User>;
	createGuestAccount: () => Promise<User>;
	upgradeGuestAccount: (
		username: string,
		password: string,
		email?: string,
	) => Promise<User>;
	logout: () => Promise<void>;
	updateUser: (user: User) => Promise<User>;
	updateUserColor: (
		userId: string,
		color?: string,
		colorLight?: string,
	) => Promise<User>;
	createProject: (project: {
		name: string;
		description: string;
		type: string;
		tags: string[];
		docUrl?: string;
		isFavorite: boolean;
	}) => Promise<Project>;
	updateProject: (project: Project) => Promise<Project>;
	deleteProject: (id: string) => Promise<void>;
	getProjectById: (id: string) => Promise<Project | null>;
	getProjects: () => Promise<Project[]>;
	getProjectsByTag: (tag: string) => Promise<Project[]>;
	searchProjects: (query: string) => Promise<Project[]>;
	toggleFavorite: (projectId: string) => Promise<Project>;
	verifyPassword: (userId: string, password: string) => Promise<boolean>;
	updatePassword: (userId: string, newPassword: string) => Promise<User>;
	isGuestUser: (user?: User | null) => boolean;
	cleanupExpiredGuests: () => Promise<void>;
}

export interface User {
	id: string;
	username: string;
	name?: string;
	passwordHash: string;
	email?: string;
	createdAt: number;
	lastLogin?: number;
	color?: string;
	colorLight?: string;
	isGuest?: boolean;
	sessionId?: string;
	expiresAt?: number;
}