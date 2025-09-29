import { createTypstCompiler } from "@myriaddreamin/typst.ts/compiler";
import { createTypstRenderer } from "@myriaddreamin/typst.ts/renderer";

let compiler: any = null;
let renderer: any = null;
let initialized = false;

async function ensureInit() {
    if (initialized) return;

    compiler = createTypstCompiler();
    await compiler.init({
        getModule: () => "/texlyre/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
    });

    renderer = createTypstRenderer();
    await renderer.init({
        getModule: () => "/texlyre/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
    });

    initialized = true;
}

self.onmessage = async (e: MessageEvent) => {
    const data = e.data as
        | { id: string; type: "compile"; payload: { mainFilePath: string; sources: Record<string, string | Uint8Array>; format: "pdf" | "svg" | "canvas" } }
        | { id: string; type: "ping" };

    const { id, type } = data;

    try {
        if (type === "ping") {
            postMessage({ id, type: "pong" });
            return;
        }

        await ensureInit();

        const payload = (data as Extract<typeof data, { type: "compile" }>).payload;
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

        const absoluteMainPath = mainFilePath.startsWith("/") ? mainFilePath : `/${mainFilePath}`;

        let output: Uint8Array | string;

        if (format === "pdf") {
            const compileResult = await compiler.compile({
                mainFilePath: absoluteMainPath,
                format: "pdf",
            });
            output = compileResult.result;
        } else {
            const compileResult = await compiler.compile({
                mainFilePath: absoluteMainPath,
                format: "vector",
            });

            output = await renderer.renderSvg({
                artifactContent: compileResult.result,
            });
        }

        const transfer = output instanceof Uint8Array ? [output.buffer as ArrayBuffer] : [];
        postMessage(
            { id, type: "done", result: { format, output } },
            transfer
        );
    } catch (err: any) {
        postMessage({ id, type: "error", error: String(err?.message || err) });
    }
};