// src/types/projects.ts
export type ProjectType = 'latex' | 'typst' | (string & {});
export type ProjectGroup = 'tex' | (string & {});

export interface Project {
	id: string;
	name: string;
	description: string;
	type: ProjectType;
	group?: ProjectGroup;
	compilerId?: string;
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

export interface TemplateVersion {
	version: string;
	downloadUrl: string;
	previewImage?: string;
	lastUpdated: string;
	compile?: string;
	file?: string;
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
	type?: ProjectType;
	group?: ProjectGroup;
	compile?: string;
	file?: string;
	versions?: TemplateVersion[];
}
