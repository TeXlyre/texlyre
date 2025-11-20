// texlyre.config.ts
export interface UserDataSettings {
    editor: {
        fontSize: string;
        fontFamily: string;
        showLineNumbers: boolean;
        syntaxHighlighting: boolean;
        themeHighlights: string;
        spellCheck: boolean;
        autoSave: {
            enable: boolean;
            delay: number;
        };
    };
    fileSystem: {
        backup: {
            enable: boolean;
            autoBackup: boolean;
        };
    };
    bibtexViewer: {
        autoTidy: boolean;
        tidyOptions: string;
    };
    imageViewer: {
        autoCenter: boolean;
        quality: string;
        enablePanning: boolean;
        enableFilters: boolean;
    };
    pdfViewer: {
        autoScale: boolean;
        renderingQuality: string;
    };
    pdfRenderer: {
        enable: boolean;
        initialZoom: string;
        textSelection: boolean;
        annotations: boolean;
    };
    theme: {
        plugin: string;
        variant: string;
    };
    typst: {
        autoCompileOnOpen: boolean;
    };
    latex: {
        engine: string;
        texliveEndpoint: string;
        storeCache: boolean;
        storeWorkingDirectory: boolean;
    };
    fileSync: {
        enable: boolean;
        autoInterval: number;
        holdTimeout: number;
        requestTimeout: number;
        conflictResolution: string;
        serverUrl: string;
        notifications: boolean;
    };
    fileTree: {
        filesystemDragDrop: boolean;
        internalDragDrop: boolean;
    };
    collab: {
        signalingServers: string;
        awarenessTimeout: number;
        autoReconnect: boolean;
    };
}

export interface UserDataProperties {
    global: {
        sidebarWidth: number;
        latexOutputWidth: number;
        sidebarCollapsed: boolean;
        latexOutputCollapsed: boolean;
        logVisualizerHeight: number;
        logVisualizerCollapsed: boolean;
        pdfRendererZoom: number;
        pdfRendererScrollView: boolean;
    };
}

export interface UserData {
    settings: UserDataSettings;
    properties: UserDataProperties;
    secrets: Record<string, unknown>;
}

type DeepPartial<T> = {
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
        local?: {
            settings?: DeepPartial<UserDataSettings>;
            properties?: DeepPartial<UserDataProperties>;
            secrets?: Record<string, unknown>;
        };
    };
}

const config: TexlyreConfig = {
    title: 'TeXlyre',
    tagline: 'A local-first LaTeX & Typst collaborative web editor',
    url: 'https://texlyre.github.io',
    baseUrl: '/texlyre/',
    organizationName: 'texlyre',
    projectName: 'texlyre',

    favicon: '/src/assets/images/TeXlyre_notext.png',

    pwa: {
        enabled: true,
        themeColor: '#000000',
        manifest: './manifest.json',
    },

    plugins: {
        collaborative_viewers: ['bibtex'],
        viewers: ['bibtex', 'image', 'pdf'],
        renderers: ['pdf', 'svg', 'canvas'],
        loggers: ['latex_visualizer', 'typst_visualizer'],
        lsp: [],
        backup: ['github', 'gitlab', 'forgejo', 'gitea'],
        themes: ['texlyre_slim', 'texlyre_wide', 'texlyre_mobile'],
    },

    userdata: {
        default: {
            settings: {
                editor: {
                    fontSize: 'base',
                    fontFamily: 'monospace',
                    showLineNumbers: true,
                    syntaxHighlighting: true,
                    themeHighlights: 'auto',
                    spellCheck: false,
                    autoSave: {
                        enable: true,
                        delay: 1000,
                    },
                },
                fileSystem: {
                    backup: {
                        enable: false,
                        autoBackup: false,
                    },
                },
                bibtexViewer: {
                    autoTidy: false,
                    tidyOptions: 'standard',
                },
                imageViewer: {
                    autoCenter: true,
                    quality: 'high',
                    enablePanning: true,
                    enableFilters: true,
                },
                pdfViewer: {
                    autoScale: true,
                    renderingQuality: 'high',
                },
                pdfRenderer: {
                    enable: true,
                    initialZoom: '200',
                    textSelection: true,
                    annotations: true,
                },
                theme: {
                    plugin: 'texlyre-wide-theme',
                    variant: 'atom_light',
                },
                typst: {
                    autoCompileOnOpen: false,
                },
                latex: {
                    engine: 'pdftex',
                    texliveEndpoint: 'https://texlive.emaily.re',
                    storeCache: true,
                    storeWorkingDirectory: false,
                },
                fileSync: {
                    enable: true,
                    autoInterval: 10,
                    holdTimeout: 30,
                    requestTimeout: 60,
                    conflictResolution: 'prefer-latest',
                    serverUrl: 'https://filepizza.emaily.re',
                    notifications: true,
                },
                fileTree: {
                    filesystemDragDrop: true,
                    internalDragDrop: true,
                },
                collab: {
                    signalingServers: 'wss://ywebrtc.emaily.re',
                    awarenessTimeout: 30,
                    autoReconnect: false,
                },
            },
            properties: {
                global: {
                    sidebarWidth: 502,
                    latexOutputWidth: 700,
                    sidebarCollapsed: false,
                    latexOutputCollapsed: true,
                    logVisualizerHeight: 600,
                    logVisualizerCollapsed: false,
                    pdfRendererZoom: 1,
                    pdfRendererScrollView: true,
                },
            },
            secrets: {},
        },
        local: {
            settings: {
                theme: {
                    variant: 'dark',
                },
                latex: {
                    texliveEndpoint: 'http://localhost:5004',
                },
                fileSync: {
                    serverUrl: 'http://localhost:8080',
                },
                collab: {
                    signalingServers: 'ws://localhost:4444/',
                },
            },
            properties: {
                global: {
                    pdfRendererScrollView: false,
                },
            },
        },
    },
};

export default config;