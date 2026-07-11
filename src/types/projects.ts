// src/types/projects.ts
export interface Project {
	id: string;
	name: string;
	description: string;
	type: 'latex' | 'typst';
	docUrl: string;
	createdAt: number;
	updatedAt: number;
	ownerId: string;
	tags: string[];
	isFavorite: boolean;
	collaboratorIds?: string[];
	lastOpenedDocId?: string;
	lastOpenedFilePath?: string;
}

export interface TemplateProject {
	id: string;
	name: string;
	description: string;
	category: string;
	tags: string[];
	downloadUrl: string;
	previewImage?: string;
	author?: string;
	version?: string;
	lastUpdated: string;
	type?: 'latex' | 'typst';
	compile?: string;
	file?: string;
}