// texlyre.config.ts
import type { TexlyreConfig } from '@/types/texlyre';

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
                bibtexViewerAutoTidy: false,
                bibtexViewerTidyOptions: 'standard',
                collabAutoReconnect: false,
                collabAwarenessTimeout: 30,
                collabSignalingServers: 'wss://ywebrtc.emaily.re',
                editorAutoSaveDelay: 1000,
                editorAutoSaveEnable: true,
                editorFontFamily: 'monospace',
                editorFontSize: 'base',
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
                fileSyncServerUrl: 'https://filepizza.emaily.re',
                fileSystemBackupAutoBackup: false,
                fileSystemBackupEnable: false,
                fileTreeFilesystemDragDrop: true,
                fileTreeInternalDragDrop: true,
                imageViewerAutoCenter: true,
                imageViewerEnableFilters: true,
                imageViewerEnablePanning: true,
                imageViewerQuality: 'high',
                latexEngine: 'pdftex',
                latexStoreCache: true,
                latexStoreWorkingDirectory: false,
                latexTexliveEndpoint: 'https://texlive.emaily.re',
                pdfRendererAnnotations: true,
                pdfRendererEnable: true,
                pdfRendererInitialZoom: '200',
                pdfRendererTextSelection: true,
                pdfViewerAutoScale: true,
                pdfViewerRenderingQuality: 'high',
                repositoryProxyUrl: 'https://proxy.emaily.re/?url=',
                templatesApiUrl: 'https://texlyre.github.io/texlyre-templates/api/templates.json',
                themePlugin: 'texlyre-wide-theme',
                themeVariant: 'atom_light',
                typstAutoCompileOnOpen: false,
            },
            properties: {
                global: {
                    latexOutputCollapsed: true,
                    latexOutputWidth: 700,
                    logVisualizerHeight: 600,
                    logVisualizerCollapsed: false,
                    pdfRendererZoom: 1,
                    pdfRendererScrollView: true,
                    sidebarCollapsed: false,
                    sidebarWidth: 502,
                    toolbarVisible: true,
                },
            },
            secrets: {},
        },
        mobile: {
            settings: {
                themePlugin: 'texlyre-mobile-theme',
                themeVariant: 'atom_light',
            },
        },
        local: {
            settings: {
                collabSignalingServers: 'ws://localhost:4444/',
                fileSyncServerUrl: 'http://localhost:8080',
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