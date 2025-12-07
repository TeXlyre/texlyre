// src/types/texlyre.ts
import type { UserDataSettings, UserDataProperties } from './userdata';

export interface UserData {
    settings: UserDataSettings;
    properties: UserDataProperties;
    secrets: Record<string, unknown>;
}

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
        lsp: string[];
        backup: string[];
        themes: string[];
    };

    userdata: {
        default: UserData;
        mobile?: {
            settings?: DeepPartial<UserDataSettings>;
            properties?: DeepPartial<UserDataProperties>;
            secrets?: Record<string, unknown>;
        };
        local?: {
            settings?: DeepPartial<UserDataSettings>;
            properties?: DeepPartial<UserDataProperties>;
            secrets?: Record<string, unknown>;
        };
    };
}