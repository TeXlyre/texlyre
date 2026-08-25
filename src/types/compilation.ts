// src/types/compilation.ts
import type { TransportConfig } from '@chelys/types/transport';

export interface CompilationOptions {
	renderOutput?: boolean;
	saveToStorage?: boolean;
	returnOutput?: boolean;
}

export interface ExportOptions {
	format?: 'pdf' | 'dvi' | 'svg' | 'canvas';
	includeLog?: boolean;
	includeAuxiliaryFiles?: boolean;
}

export type TypesetterSource = 'builtin' | 'chelys';

export interface CompileArtifact {
	id: string;
	name: string;
	mimeType?: string;
	data: Uint8Array;
}

export interface CompileResult {
	pdf?: Uint8Array;
	status: number;
	log: string;
	artifacts?: CompileArtifact[];
}

export type TypesetterTransportConfig = TransportConfig;

export interface TypesetterOutputFormat {
	id: string;
	mimeType: string;
	rendererPluginId?: string;
	outputType?: string;
}

export interface TypesetterCapabilities {
	outline?: boolean;
	formatter?: string;
	toolbarId?: string;
	shortcutsId?: string;
}

export type TranslatableText =
	| string
	| { key: string; params?: Record<string, string> };

export type TypesetterFieldKind = 'select' | 'boolean' | 'text' | 'number';

export interface TypesetterUIFieldOption {
	label: TranslatableText;
	value: string;
}

export interface TypesetterUIFieldCondition {
	field: string;
	in: string[];
}

export interface TypesetterUIField {
	key: string;
	label: TranslatableText;
	kind: TypesetterFieldKind;
	defaultValue?: string | number | boolean;
	options?: TypesetterUIFieldOption[];
	help?: TranslatableText;
	sendAs?: 'option' | 'format';
	group?: string;
	showWhen?: TypesetterUIFieldCondition;
}

export interface TypesetterUISection {
	label?: TranslatableText;
	fields: TypesetterUIField[];
}

export interface TypesetterUIInfoRow {
	label: TranslatableText;
	value: TranslatableText;
}

export interface TypesetterUIInfoSection {
	title: TranslatableText;
	rows: TypesetterUIInfoRow[];
}

export interface TypesetterUIRenderer {
	format: string;
	label: TranslatableText;
}

export interface TypesetterUISchema {
	compile?: TypesetterUISection;
	export?: TypesetterUISection;
	info?: TypesetterUIInfoSection;
	renderers?: TypesetterUIRenderer[];
}

export interface TypesetterInputFile {
	extension: string;
	label?: TranslatableText;
	mimeType?: string;
}

export interface TypesetterProvider {
	id: string;
	label: string;
	source: TypesetterSource;
	projectType: string;
	projectGroup?: string;
	inputExtensions: string[];
	inputFiles?: TypesetterInputFile[];
	outputFormats: TypesetterOutputFormat[];
	transport?: TypesetterTransportConfig;
	capabilities: TypesetterCapabilities;
	ui?: TypesetterUISchema;
}
