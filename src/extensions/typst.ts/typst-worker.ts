// src/extensions/typst.ts/typst-worker.ts
/// <reference lib="webworker" />
export { };

import { createTypstCompiler } from "@myriaddreamin/typst.ts/compiler";
import { createTypstRenderer } from "@myriaddreamin/typst.ts/renderer";

// Tell TS we're in a Dedicated Worker context.
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

        // From here, it's a compile message
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

        if (format === "pdf") {
            const compileResult = await compiler.compile({
                mainFilePath: absoluteMainPath,
                format: "pdf",
            });
            output = compileResult.result as Uint8Array;
        } else {
            const compileResult = await compiler.compile({
                mainFilePath: absoluteMainPath,
                format: "vector",
            });

            // SVG/Canvas renderer returns string (SVG markup) or binary depending on API
            output = await renderer.renderSvg({
                artifactContent: compileResult.result,
            });
        }

        // Transfer ArrayBuffer when possible to avoid copying
        const transferList: Transferable[] =
            output instanceof Uint8Array ? [output.buffer as ArrayBuffer] : [];

        const resp: DoneResponse = {
            id,
            type: "done",
            result: { format, output },
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
