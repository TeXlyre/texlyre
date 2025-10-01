/// <reference lib="webworker" />
export { };
import { createTypstCompiler } from "@myriaddreamin/typst.ts/compiler";
import { createTypstRenderer } from "@myriaddreamin/typst.ts/renderer";
import { TypstSnippet } from "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs";

declare const self: DedicatedWorkerGlobalScope;

type OutputFormat = "pdf" | "svg" | "canvas";

type CompileMessage = {
    id: string;
    type: "compile";
    payload: {
        mainFilePath: string;
        sources: Record<string, string | Uint8Array>;
        format: OutputFormat;
    };
};

type PingMessage = {
    id: string;
    type: "ping";
};

type InboundMessage = CompileMessage | PingMessage;

type DoneResponse = {
    id: string;
    type: "done";
    result: {
        format: OutputFormat;
        output: Uint8Array | string;
        diagnostics?: any[];
    };
};

type PongResponse = {
    id: string;
    type: "pong";
};

type ErrorResponse = {
    id: string;
    type: "error";
    error: string;
};

let compiler: any = null;
let renderer: any = null;
let initialized = false;

const defaultFonts = [
    'DejaVuSansMono-Bold.ttf',
    'DejaVuSansMono-BoldOblique.ttf',
    'DejaVuSansMono-Oblique.ttf',
    'DejaVuSansMono.ttf',
    'LibertinusSerif-Bold.otf',
    'LibertinusSerif-BoldItalic.otf',
    'LibertinusSerif-Italic.otf',
    'LibertinusSerif-Regular.otf',
    'LibertinusSerif-Semibold.otf',
    'LibertinusSerif-SemiboldItalic.otf',
    'NewCM10-Bold.otf',
    'NewCM10-BoldItalic.otf',
    'NewCM10-Italic.otf',
    'NewCM10-Regular.otf',
    'NewCMMath-Bold.otf',
    'NewCMMath-Book.otf',
    'NewCMMath-Regular.otf',
];

async function loadFonts(baseUrl: string = '/texlyre/assets/fonts') {
    const fontPaths = defaultFonts.map(font => `${baseUrl}/${font}`);
    const fontPromises = fontPaths.map(async (path) => {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                console.warn(`Failed to fetch font: ${path}`);
                return null;
            }
            const buffer = await response.arrayBuffer();
            return new Uint8Array(buffer);
        } catch (err) {
            console.warn(`Error loading font ${path}:`, err);
            return null;
        }
    });
    const fonts = await Promise.all(fontPromises);
    return fonts.filter((f) => f !== null) as Uint8Array[];
}

async function ensureInit() {
    if (initialized) return;

    const fonts = await loadFonts();
    const packageRegistry = TypstSnippet.fetchPackageRegistry();

    compiler = createTypstCompiler();
    await compiler.init({
        getModule: () => "/texlyre/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
        beforeBuild: [
            ...packageRegistry.provides,
            async (_: any, { builder }: any) => {
                for (const font of fonts) {
                    await builder.add_raw_font(font);
                }
            }
        ],
    });

    renderer = createTypstRenderer();
    await renderer.init({
        getModule: () => "/texlyre/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
        beforeBuild: [
            async (_: any, { builder }: any) => {
                for (const font of fonts) {
                    await builder.add_raw_font(font);
                }
            }
        ],
    });

    initialized = true;
}

self.addEventListener("message", async (e: MessageEvent<InboundMessage>) => {
    const data = e.data;
    const { id, type } = data;
    try {
        if (type === "ping") {
            const resp: PongResponse = { id, type: "pong" };
            self.postMessage(resp);
            return;
        }
        await ensureInit();

        const { payload } = data as CompileMessage;
        const { mainFilePath, sources, format } = payload;
        compiler.resetShadow();
        for (const [path, content] of Object.entries(sources)) {
            const absolutePath = path.startsWith("/") ? path : `/${path}`;
            if (typeof content === "string") {
                compiler.addSource(absolutePath, content);
            } else {
                compiler.mapShadow(absolutePath, content);
            }
        }
        const absoluteMainPath =
            mainFilePath.startsWith("/") ? mainFilePath : `/${mainFilePath}`;
        let output: Uint8Array | string;
        let diagnostics: any[] = [];

        if (format === "pdf") {
            const compileResult = await compiler.compile({
                mainFilePath: absoluteMainPath,
                format: "pdf",
            });
            output = compileResult.result as Uint8Array;
            diagnostics = compileResult.diagnostics || [];
        } else {
            const compileResult = await compiler.compile({
                mainFilePath: absoluteMainPath,
                format: "vector",
            });
            diagnostics = compileResult.diagnostics || [];
            output = await renderer.renderSvg({
                artifactContent: compileResult.result,
            });
        }

        const transferList: Transferable[] =
            output instanceof Uint8Array ? [output.buffer as ArrayBuffer] : [];
        const resp: DoneResponse = {
            id,
            type: "done",
            result: { format, output, diagnostics },
        };
        self.postMessage(resp, transferList);
    } catch (err: unknown) {
        const message =
            typeof err === "object" && err && "message" in err
                ? String((err as any).message)
                : String(err);
        const resp: ErrorResponse = { id, type: "error", error: message };
        self.postMessage(resp);
    }
});