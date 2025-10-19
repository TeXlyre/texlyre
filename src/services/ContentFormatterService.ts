// src/services/ContentFormatterService.ts
import { WasmToolsEngine } from '../extensions/wasm-tools/WasmToolsEngine';
import { notificationService } from './NotificationService';

export interface LatexFormatOptions {
    wrap: boolean;
    wraplen: number;
    tabsize: number;
    usetabs: boolean;
}

export interface TypstFormatOptions {
    // Future options for typststyle
}

class ContentFormatterService {
    private engine: WasmToolsEngine | null = null;

    private getEngine(): WasmToolsEngine {
        if (!this.engine) {
            this.engine = new WasmToolsEngine();
        }
        return this.engine;
    }

    async formatLatex(
        input: string,
        options: LatexFormatOptions
    ): Promise<{ success: boolean; output?: string; error?: string }> {
        const engine = this.getEngine();

        try {
            const result = await engine.formatLatex(input, options);
            return result;
        } catch (error) {
            console.error('[ContentFormatterService] LaTeX format failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async formatTypst(
        input: string,
        options: TypstFormatOptions
    ): Promise<{ success: boolean; output?: string; error?: string }> {
        // Future implementation for typststyle
        return {
            success: false,
            error: 'Typst formatting not yet implemented'
        };
    }

    terminate(): void {
        if (this.engine) {
            this.engine.terminate();
            this.engine = null;
        }
    }

    private areNotificationsEnabled(): boolean {
        const userId = localStorage.getItem('texlyre-current-user');
        const storageKey = userId
            ? `texlyre-user-${userId}-settings`
            : 'texlyre-settings';
        try {
            const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
            return settings['formatter-notifications'] !== false;
        } catch {
            return true;
        }
    }

    showLoadingNotification(message: string, operationId?: string): void {
        if (this.areNotificationsEnabled()) {
            notificationService.showLoading(message, operationId);
        }
    }

    showSuccessNotification(
        message: string,
        options: {
            operationId?: string;
            duration?: number;
        } = {}
    ): void {
        if (this.areNotificationsEnabled()) {
            notificationService.showSuccess(message, options);
        }
    }

    showErrorNotification(
        message: string,
        options: {
            operationId?: string;
            duration?: number;
        } = {}
    ): void {
        if (this.areNotificationsEnabled()) {
            notificationService.showError(message, options);
        }
    }
}

export const contentFormatterService = new ContentFormatterService();