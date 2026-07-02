// src/types/compilation.ts
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

export type CompilerSource = 'builtin' | 'chelys';

export interface CompilerTransportConfig {
	type: 'websocket' | 'webrtc';
	url?: string;
	signaling?: string[];
	roomId?: string;
}

export interface CompilerOutputFormat {
	id: string;
	mimeType: string;
	rendererPluginId?: string;
	outputType?: string;
}

export interface CompilerCapabilities {
	outline?: boolean;
	formatter?: string;
	toolbarId?: string;
	shortcutsId?: string;
}

export type TranslatableText =
	| string
	| { key: string; params?: Record<string, string> };

export type CompilerFieldKind = 'select' | 'boolean' | 'text' | 'number';

export interface CompilerUIFieldOption {
	label: TranslatableText;
	value: string;
}

export interface CompilerUIField {
	key: string;
	label: TranslatableText;
	kind: CompilerFieldKind;
	defaultValue?: string | number | boolean;
	options?: CompilerUIFieldOption[];
	help?: TranslatableText;
	sendAs?: 'option' | 'format';
}

export interface CompilerUISection {
	label?: TranslatableText;
	fields: CompilerUIField[];
}

export interface CompilerUIInfoRow {
	label: TranslatableText;
	value: TranslatableText;
}

export interface CompilerUIInfoSection {
	title: TranslatableText;
	rows: CompilerUIInfoRow[];
}

export interface CompilerUIRenderer {
	format: string;
	label: TranslatableText;
}

export interface CompilerUISchema {
	compile?: CompilerUISection;
	export?: CompilerUISection;
	info?: CompilerUIInfoSection;
	renderers?: CompilerUIRenderer[];
}

export interface CompilerInputFile {
	extension: string;
	label?: TranslatableText;
	mimeType?: string;
}

export interface CompilerProvider {
	id: string;
	label: string;
	source: CompilerSource;
	projectType: string;
	inputExtensions: string[];
	inputFiles?: CompilerInputFile[];
	outputFormats: CompilerOutputFormat[];
	transport?: CompilerTransportConfig;
	capabilities: CompilerCapabilities;
	ui?: CompilerUISchema;
}
