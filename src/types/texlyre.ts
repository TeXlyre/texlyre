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