// src/contexts/AuthContext.tsx
import type React from "react";
import { type ReactNode, createContext, useEffect, useState } from "react";

import { authService } from "../services/AuthService";
import type { AuthContextType, User } from "../types/auth";
import type { Project } from "../types/projects";

export const AuthContext = createContext<AuthContextType>({
	user: null,
	isAuthenticated: false,
	isInitializing: true,
	login: async () => {
		throw new Error("Not implemented");
	},
	register: async () => {
		throw new Error("Not implemented");
	},
	logout: async () => {
		throw new Error("Not implemented");
	},
	updateUser: async () => {
		throw new Error("Not implemented");
	},

	updateUserColor: async () => {
		throw new Error("Not implemented");
	},

	createProject: async () => {
		throw new Error("Not implemented");
	},
	updateProject: async () => {
		throw new Error("Not implemented");
	},
	deleteProject: async () => {
		throw new Error("Not implemented");
	},
	getProjectById: async () => {
		throw new Error("Not implemented");
	},
	getProjects: async () => {
		throw new Error("Not implemented");
	},
	getProjectsByTag: async () => {
		throw new Error("Not implemented");
	},
	searchProjects: async () => {
		throw new Error("Not implemented");
	},
	toggleFavorite: async () => {
		throw new Error("Not implemented");
	},
	verifyPassword: async () => {
		throw new Error("Not implemented");
	},
	updatePassword: async () => {
		throw new Error("Not implemented");
	},
});

interface AuthProviderProps {
	children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
	const [user, setUser] = useState<User | null>(null);
	const [isInitializing, setIsInitializing] = useState(true);

	useEffect(() => {
		const initAuth = async () => {
			await authService.initialize();
			setUser(authService.getCurrentUser());
			setIsInitializing(false);
		};

		initAuth();
	}, []);

	const login = async (username: string, password: string): Promise<User> => {
		const loggedInUser = await authService.login(username, password);
		setUser(loggedInUser);
		return loggedInUser;
	};

	const register = async (
		username: string,
		password: string,
		email?: string,
	): Promise<User> => {
		const newUser = await authService.register(username, password, email);
		setUser(newUser);
		return newUser;
	};

	const logout = async (): Promise<void> => {
		await authService.logout();
		setUser(null);
	};

	const updateUser = async (updatedUser: User): Promise<User> => {
		const result = await authService.updateUser(updatedUser);
		setUser(result);
		return result;
	};

	const updateUserColor = async (
		userId: string,
		color?: string,
		colorLight?: string,
	): Promise<User> => {
		const updatedUser = await authService.updateUserColor(
			userId,
			color,
			colorLight,
		);
		setUser(updatedUser);
		return updatedUser;
	};

	const createProject = async (
		projectData: Omit<Project, "id" | "createdAt" | "updatedAt" | "ownerId">,
	): Promise<Project> => {
		return authService.createProject(projectData);
	};

	const updateProject = async (project: Project): Promise<Project> => {
		return authService.updateProject(project);
	};

	const deleteProject = async (id: string): Promise<void> => {
		return authService.deleteProject(id);
	};

	const getProjectById = async (id: string): Promise<Project | null> => {
		return authService.getProjectById(id);
	};

	const getProjects = async (): Promise<Project[]> => {
		return authService.getProjectsByUser();
	};

	const getProjectsByTag = async (tag: string): Promise<Project[]> => {
		return authService.getProjectsByTag(tag);
	};

	const searchProjects = async (query: string): Promise<Project[]> => {
		return authService.searchProjects(query);
	};

	const toggleFavorite = async (projectId: string): Promise<Project> => {
		return authService.toggleFavorite(projectId);
	};

	const verifyPassword = async (
		userId: string,
		password: string,
	): Promise<boolean> => {
		return authService.verifyPassword(userId, password);
	};

	const updatePassword = async (
		userId: string,
		newPassword: string,
	): Promise<User> => {
		const updatedUser = await authService.updatePassword(userId, newPassword);
		setUser(updatedUser);
		return updatedUser;
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				isAuthenticated: !!user,
				isInitializing,
				login,
				register,
				logout,
				updateUser,
				updateUserColor,
				createProject,
				updateProject,
				deleteProject,
				getProjectById,
				getProjects,
				getProjectsByTag,
				searchProjects,
				toggleFavorite,
				verifyPassword,
				updatePassword,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
};
