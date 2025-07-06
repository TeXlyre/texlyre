// src/types/projects.ts
export interface Project {
	id: string;
	name: string;
	description: string;
	docUrl: string;
	createdAt: number;
	updatedAt: number;
	ownerId: string;
	tags: string[];
	isFavorite: boolean;
	collaboratorIds?: string[];
}
