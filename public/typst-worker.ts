// typst-worker.ts
import { $typst } from "@myriaddreamin/typst.ts";

let initialized = false;

async function ensureInit() {
    if (initialized) return;
    await $typst.setCompilerInitOptions({
        getModule: () => "/texlyre/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
    });
    await $typst.setRendererInitOptions({
        getModule: () => "/texlyre/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
    });
    initialized = true;
}

self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data as
        | { id: string; type: "compile"; payload: { mainContent: string; sources: Record<string, string | Uint8Array>; format: "pdf" | "svg" | "canvas" } }
        | { id: string; type: "ping" };

    try {
        if (type === "ping") {
            postMessage({ id, type: "pong" });
            return;
        }

        await ensureInit();

        const { mainContent, sources, format } = payload;

        const opts = { mainContent, sources };
        let output: Uint8Array | string;

        if (format === "pdf") {
            output = await $typst.pdf(opts);
        } else {
            // 'canvas' uses SVG as intermediate
            output = await $typst.svg(opts);
        }

        postMessage({ id, type: "done", result: { format, output } },
            // transfer large buffers if possible
            output instanceof Uint8Array ? [output.buffer] : undefined
        );
    } catch (err: any) {
        postMessage({ id, type: "error", error: String(err?.message || err) });
    }
};
