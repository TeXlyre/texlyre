// src/workers/typst-worker.ts
/// <reference lib="webworker" />

import { $typst } from "@myriaddreamin/typst.ts";

type TypstOutputFormat = "pdf" | "svg" | "canvas";

type CompilePayload = {
    mainContent: string;
    sources: Record<string, string | Uint8Array>;
    format: TypstOutputFormat;
};

type WorkerIn =
    | { id: string; type: "compile"; payload: CompilePayload }
    | { id: string; type: "ping" };

type WorkerOut =
    | { id: string; type: "pong" }
    | { id: string; type: "done"; result: { format: TypstOutputFormat; output: Uint8Array | string } }
    | { id: string; type: "error"; error: string };

let initialized = false;

async function ensureInit() {
    if (initialized) return;

    // Initialize compiler & renderer WASM inside the worker
    await $typst.setCompilerInitOptions({
        getModule: () => "/texlyre/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
    });

    await $typst.setRendererInitOptions({
        getModule: () => "/texlyre/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
    });

    initialized = true;
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
    void handleMessage(e.data);
};

async function handleMessage(msg: WorkerIn) {
    const post = (out: WorkerOut, transfers?: Transferable[]) => {
        (self as unknown as Worker).postMessage(out, transfers || []);
    };

    const { id, type } = msg;

    try {
        if (type === "ping") {
            post({ id, type: "pong" });
            return;
        }

        if (type === "compile") {
            await ensureInit();

            const { mainContent, sources, format } = msg.payload;
            const compileOptions = { mainContent, sources };

            let output: Uint8Array | string;

            if (format === "pdf") {
                output = await $typst.pdf(compileOptions);
                // Transfer the underlying ArrayBuffer to avoid copies
                post({ id, type: "done", result: { format, output } }, [(output as Uint8Array).buffer]);
            } else {
                // 'canvas' uses SVG as intermediate
                output = await $typst.svg(compileOptions);
                post({ id, type: "done", result: { format, output } });
            }

            return;
        }

        post({ id, type: "error", error: `Unknown worker message type: ${type as string}` });
    } catch (err: any) {
        post({ id, type: "error", error: String(err?.message ?? err) });
    }
}
