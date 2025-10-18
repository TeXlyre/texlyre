// src/extensions/wasm-tools/WasmToolsEngine.ts
import { WebPerlRunner, TexCount } from 'wasm-latex-tools';

export class WasmToolsEngine {
    private runner: WebPerlRunner | null = null;
    private texCount: TexCount | null = null;
    private initPromise: Promise<void> | null = null;

    private async ensureInitialized(): Promise<void> {
        if (this.texCount) return;

        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }

        return this.initPromise;
    }

    private async initialize(): Promise<void> {
        const basePath = window.location.origin + window.location.pathname.replace(/\/$/, '');

        this.runner = new WebPerlRunner({
            webperlBasePath: `${basePath}/core/webperl`,
            perlScriptsPath: `${basePath}/core/perl`,
            verbose: false
        });

        await this.runner.initialize();
        this.texCount = new TexCount(this.runner, false);
    }

    async count(
        input: string,
        options: {
            sum: boolean;
            brief: boolean;
            total: boolean;
            verbose: number;
            includeFiles: boolean;
            merge: boolean;
        },
        additionalFiles?: Array<{ path: string; content: string }>
    ): Promise<{ success: boolean; output?: string; error?: string }> {
        await this.ensureInitialized();

        return await this.texCount!.count({
            input,
            sum: options.sum,
            brief: options.brief,
            total: options.total,
            verbose: options.verbose,
            includeFiles: options.includeFiles,
            merge: options.merge,
            additionalFiles: additionalFiles || []
        });
    }

    terminate(): void {
        this.runner = null;
        this.texCount = null;
        this.initPromise = null;
    }
}