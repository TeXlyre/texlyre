// src/types/texlyre.ts
import type { UserDataSettings, UserDataProperties } from './userdata';

export interface UserData {
	settings: UserDataSettings;
	properties: UserDataProperties;
	secrets: Record<string, unknown>;
	records: Record<string, unknown>;
}

export type UserDataPropertyId = {
	[S in keyof UserDataProperties]: `${Extract<
		keyof NonNullable<UserDataProperties[S]>,
		string
	>}:${Extract<S, string>}`;
}[keyof UserDataProperties];

export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface TexlyreConfig {
	title: string;
	tagline: string;
	url: string;
	baseUrl: string;
	organizationName: string;
	projectName: string;

	favicon: string;

	airgap?: {
		allowedDomains?: string[];
		allowedProtocols?: string[];
	};

	pwa?: {
		enabled: boolean;
		themeColor: string;
		manifest: string;

		// All optional – if omitted, your generator can fall back
		// to title/tagline/baseUrl/etc.
		startUrl?: string;
		name?: string;
		shortName?: string;
		description?: string;
		display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';
		backgroundColor?: string;
		icons?: Array<{
			src: string;
			sizes: string;
			type: string;
			purpose?: string;
		}>;
	};

	plugins: {
		collaborative_viewers: string[];
		viewers: string[];
		renderers: string[];
		loggers: string[];
		bibliography: string[];
		lsp: string[];
		backup: string[];
		themes: string[];
	};

	userdata: {
		version: string;
		forceUpdate?: {
			settings?: Array<Extract<keyof UserDataSettings, string>>;
			properties?: UserDataPropertyId[];
		};
		default: UserData;
		mobile?: {
			settings?: DeepPartial<UserDataSettings>;
			properties?: DeepPartial<UserDataProperties>;
			secrets?: Record<string, unknown>;
			records?: Record<string, unknown>;
		};
		local?: {
			settings?: DeepPartial<UserDataSettings>;
			properties?: DeepPartial<UserDataProperties>;
			secrets?: Record<string, unknown>;
			records?: Record<string, unknown>;
		};
	};
}
