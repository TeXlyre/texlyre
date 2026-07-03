// texlyre.config.ts
import type { TexlyreConfig } from '@/types/texlyre';

const config: TexlyreConfig = {
    title: 'TeXlyre',
    tagline: 'A local-first LaTeX & Typst collaborative web editor',
    url: 'https://texlyre.org',
    baseUrl: '/texlyre/',
    organizationName: 'texlyre',
    projectName: 'texlyre',
    favicon: '/favicon.ico',


    airgap: {
        allowedDomains: [
            'texlyre.github.io',
            'texlyre.org',
            'typst.org',
        ],
        allowedProtocols: [
            'https:',
            'http:',
            // Collaboration is blocked by airgap but allow ws anyway
            'wss:',
            'ws:',
        ],
    },

    pwa: {
        enabled: true,
        themeColor: '#ffffff',
        manifest: './manifest.json',
        startUrl: './',
        backgroundColor: '#ffffff',
        icons: [
            {
                src: './assets/images/TeXlyre_notext_192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable',
            },
        ],
        display: 'standalone',
        // All of these are OPTIONAL; if omitted, the script will fall back
        // to title & tagline.
        // name: 'TeXlyre',
        // shortName: 'TeXlyre',
        // description: 'A local-first LaTeX & Typst collaborative web editor',
    },

    plugins: {
        collaborative_viewers: ['bibtex', 'drawio', 'tikz', 'milkdown'],
        viewers: ['bibtex', 'image', 'media', 'pdf', 'drawio', 'tikz', 'milkdown'],
        renderers: ['pdf', 'canvas'],
        loggers: ['latex_visualizer', 'typst_visualizer'],
        bibliography: ['zotero', 'openalex'], // 'jabref' 
        lsp: [],
        backup: ['github', 'gitlab', 'forgejo', 'gitea'],
        themes: ['texlyre_slim', 'texlyre_wide', 'texlyre_mobile'],
    },

    // Overwrite priority is default < local < mobile for corresponding configs
    userdata: {
        version: '1.2.1',
        default: {
            settings: {
                bibtexViewerAutoTidy: false,
                bibtexViewerTidyOptions: 'standard',
                canvasRendererAnnotations: true,
                canvasRendererEnable: true,
                canvasRendererInitialZoom: '100',
                canvasRendererTextSelection: true,
                collabAutoReconnect: false,
                collabAwarenessTimeout: 30,
                collabProviderType: 'webrtc',
                collabSignalingServers: 'wss://ywebrtc.texlyre.org',
                editorAutoSaveDelay: 1000,
                editorAutoSaveEnable: true,
                editorFontFamily: 'monospace',
                editorFontSize: 'lg',
                editorShowLineNumbers: true,
                editorSpellCheck: false,
                editorSyntaxHighlighting: true,
                editorThemeHighlights: 'auto',
                fileSyncAutoInterval: 10,
                fileSyncConflictResolution: 'prefer-latest',
                fileSyncEnable: true,
                fileSyncHoldTimeout: 30,
                fileSyncNotifications: true,
                fileSyncRequestTimeout: 60,
                fileSyncServerUrl: 'https://filepizza.texlyre.org',
                fileSysBackupAutoBackup: false,
                fileSysBackupEnable: true,
                fileTreeFilesystemDragDrop: true,
                fileTreeInternalDragDrop: true,
                imageViewerAutoCenter: true,
                imageViewerEnableFilters: true,
                imageViewerQuality: 'high',
                latexEngine: 'pdftex',
                latexDefaultFormat: 'pdf',  // 'canvas-pdf'
                latexStoreCache: true,
                latexStoreWorkingDirectory: false,
                latexTexliveEndpoint: 'https://texlive.texlyre.org',
                latexBusytexEndpoint: 'https://texlive2026.texlyre.org',
                pdfRendererAnnotations: true,
                pdfRendererEnable: true,
                pdfRendererInitialZoom: '100',
                pdfRendererTextSelection: true,
                pdfViewerAutoScale: true,
                pdfViewerRenderingQuality: 'high',
                repositoryProxyUrl: 'https://proxy.texlyre.org/?url=',
                latexSourcemapEnable: true,
                templatesApiUrl: 'https://texlyre.github.io/texlyre-templates/api/templates.json',
                themePlugin: 'texlyre-wide-theme',
                themeVariant: 'atom_light',
                typstAutoCompileOnOpen: false,
                typstDefaultFormat: 'canvas',
                typstSourcemapEnable: true,
            },
            properties: {
                global: {
                    latexOutputCollapsed: true,
                    latexOutputWidth: 700,
                    logVisualizerHeight: 600,
                    logVisualizerCollapsed: false,
                    pdfRendererZoom: 1,
                    pdfRendererScrollView: true,
                    canvasRendererZoom: 1,
                    canvasRendererScrollView: true,
                    sidebarCollapsed: false,
                    sidebarWidth: 502,
                    sourcemapShowFloatingButtons: true,
                    themeToggleLight: "atom_light",
                    themeToggleDark: "tomorrow_night_blue",
                    toolbarVisible: true,
                },
            },
            secrets: {},
            records: {},
        },
        mobile: {
            settings: {
                fileSysBackupEnable: false,
                themePlugin: 'texlyre-mobile-theme',
                imageViewerAutoCenter: true,
            },
            properties: {
                global: {
                    projectListViewMode: 'list',
                }
            }
        },
        local: {
            settings: {
                collabSignalingServers: 'ws://localhost:4444/',
                fileSyncServerUrl: 'http://localhost:8080',
                latexBusytexEndpoint: 'http://localhost:8070',
                latexTexliveEndpoint: 'http://localhost:5004',
                themeVariant: 'dark',

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
