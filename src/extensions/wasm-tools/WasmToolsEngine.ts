// src/extensions/wasm-tools/WasmToolsEngine.ts
import { WebPerlRunner, TexCount, TexFmt } from 'wasm-latex-tools';

const BASE_PATH = __BASE_PATH__;

type WasmEngine = 'webperl' | 'texfmt' | 'all';

export class WasmToolsEngine {
    private runner: WebPerlRunner | null = null;
    private texCount: TexCount | null = null;
    private texFmt: TexFmt | null = null;
    private initPromise: Promise<void> | null = null;
    private enabledEngines: Set<WasmEngine> = new Set();

    private async ensureInitialized(engine: WasmEngine = 'webperl'): Promise<void> {
        if (engine === 'webperl' && this.texCount) return;
        if (engine === 'texfmt' && this.texFmt) return;
        if (engine === 'all' && this.texCount && this.texFmt) return;

        if (!this.initPromise) {
            this.initPromise = this.initialize(engine);
        } else if (!this.enabledEngines.has(engine) && engine !== 'all') {
            await this.initPromise;
            await this.initialize(engine);
        }

        return this.initPromise;
    }

    private async initialize(engine: WasmEngine = 'webperl'): Promise<void> {
        if (engine === 'webperl' || engine === 'all') {
            if (!this.runner) {
                this.runner = new WebPerlRunner({
                    webperlBasePath: `${BASE_PATH}/core/webperl`,
                    perlScriptsPath: `${BASE_PATH}/core/perl`,
                    verbose: false
                });

                await this.runner.initialize();
                this.texCount = new TexCount(this.runner, false);
                this.enabledEngines.add('webperl');
            }
        }

        if (engine === 'texfmt' || engine === 'all') {
            if (!this.texFmt) {
                this.texFmt = new TexFmt(false, `${BASE_PATH}/core/texfmt`);
                this.enabledEngines.add('texfmt');
            }
        }
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
        await this.ensureInitialized('webperl');

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

    async formatLatex(
        input: string,
        options: {
            wrap: boolean;
            wraplen: number;
            tabsize: number;
            usetabs: boolean;
        }
    ): Promise<{ success: boolean; output?: string; error?: string }> {
        await this.ensureInitialized('texfmt');

        return await this.texFmt!.format({
            input,
            wrap: options.wrap,
            wraplen: options.wraplen,
            tabsize: options.tabsize,
            usetabs: options.usetabs
        });
    }

    terminate(): void {
        this.runner = null;
        this.texCount = null;
        this.texFmt = null;
        this.initPromise = null;
        this.enabledEngines.clear();
    }
}