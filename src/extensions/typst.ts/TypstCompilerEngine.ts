// src/extensions/typst.ts/TypstCompilerEngine.ts
import { nanoid } from "nanoid";

export type TypstWorkerMessage =
    | { id: string; type: "compile"; payload: { mainFilePath: string; sources: Record<string, string | Uint8Array>; format: "pdf" | "svg" | "canvas" } }
    | { id: string; type: "ping" };

export type TypstWorkerResponse =
    | { id: string; type: "pong" }
    | { id: string; type: "done"; result: { format: string; output: Uint8Array | string; diagnostics?: any[] } }
    | { id: string; type: "error"; error: string };

export class TypstCompilerEngine {
    private worker: Worker | null = null;
    private pendingResolves: Map<string, (v: any) => void> = new Map();
    private pendingRejects: Map<string, (e: any) => void> = new Map();

    getWorker(): Worker {
        if (this.worker) return this.worker;

        this.worker = new Worker(new URL("./typst-worker.ts", import.meta.url), {
            type: "module",
        });

        this.worker.onmessage = (e: MessageEvent<TypstWorkerResponse>) => {
            const { id, type } = e.data;

            if (!id) return;

            if (type === "done" || type === "pong") {
                const resolve = this.pendingResolves.get(id);
                if (resolve) resolve("result" in e.data ? e.data.result : undefined);
            } else if (type === "error") {
                const reject = this.pendingRejects.get(id);
                if (reject) reject(new Error(e.data.error || "Worker error"));
            }

            this.pendingResolves.delete(id);
            this.pendingRejects.delete(id);
        };

        this.worker.onerror = (ev) => {
            const err = new Error(`Typst worker error: ${String(ev.message || ev)}`);
            this.pendingRejects.forEach((reject) => reject(err));
            this.pendingResolves.clear();
            this.pendingRejects.clear();
            this.worker = null;
        };

        return this.worker;
    }

    async ping(): Promise<void> {
        return this.callWorker("ping", undefined);
    }

    async compile(
        mainFilePath: string,
        sources: Record<string, string | Uint8Array>,
        format: "pdf" | "svg" | "canvas",
        signal?: AbortSignal
    ): Promise<{ format: string; output: Uint8Array | string; diagnostics?: any[] }> {
        return this.callWorker("compile", { mainFilePath, sources, format }, signal);
    }

    terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.pendingResolves.clear();
        this.pendingRejects.clear();
    }

    private callWorker<TType extends "compile" | "ping">(
        type: TType,
        payload: TType extends "compile"
            ? { mainFilePath: string; sources: Record<string, string | Uint8Array>; format: "pdf" | "svg" | "canvas" }
            : undefined,
        signal?: AbortSignal
    ): Promise<any> {
        const id = nanoid();
        const worker = this.getWorker();

        const promise = new Promise((resolve, reject) => {
            this.pendingResolves.set(id, resolve);
            this.pendingRejects.set(id, reject);
        });

        const abort = () => {
            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
            }
            const reject = this.pendingRejects.get(id);
            if (reject) reject(new Error("Compilation was cancelled"));
            this.pendingResolves.delete(id);
            this.pendingRejects.delete(id);
        };

        if (signal) {
            if (signal.aborted) {
                abort();
                return Promise.reject(new Error("Compilation was cancelled"));
            }
            signal.addEventListener("abort", abort, { once: true });
        }

        worker.postMessage({ id, type, payload });

        return promise;
    }
}