// src/extensions/wasm-tools/TypstyleEngine.ts
export interface TypstyleOptions {
    lineWidth?: number;
    indentWidth?: number;
    reorderImportItems?: boolean;
    wrapText?: boolean;
}

export class TypstyleEngine {
    private wasmModule: any = null;
    private initPromise: Promise<void> | null = null;

    private async ensureInitialized(): Promise<void> {
        if (this.wasmModule) return;
        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }
        return this.initPromise;
    }

    private async initialize(): Promise<void> {
        try {
            const module = await import('@typstyle/typstyle-wasm-bundler');
            this.wasmModule = module;
        } catch (error) {
            console.error('[TypstyleEngine] Initialization failed:', error);
            throw error;
        }
    }

    async format(
        input: string,
        options: TypstyleOptions = {}
    ): Promise<{ success: boolean; output?: string; error?: string }> {
        await this.ensureInitialized();

        try {
            const config = {
                line_width: options.lineWidth ?? 80,
                indent_width: options.indentWidth ?? 2,
                reorder_import_items: options.reorderImportItems ?? true,
                wrap_text: options.wrapText ?? false
            };

            const output = this.wasmModule.format(input, config);
            return { success: true, output };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    terminate(): void {
        this.wasmModule = null;
        this.initPromise = null;
    }
}