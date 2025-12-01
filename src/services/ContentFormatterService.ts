// src/services/ContentFormatterService.ts
import { t } from '@/i18n';
import { WasmToolsEngine } from '../extensions/wasm-tools/WasmToolsEngine';
import { TypstyleOptions } from '../extensions/wasm-tools/TypstyleEngine';
import { notificationService } from './NotificationService';

export interface LatexFormatOptions {
    wrap: boolean;
    wraplen: number;
    tabsize: number;
    usetabs: boolean;
}

export interface TypstFormatOptions extends TypstyleOptions { }

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
                error: error instanceof Error ? error.message : t('Unknown error')
            };
        }
    }

    async formatTypst(
        input: string,
        options: TypstFormatOptions
    ): Promise<{ success: boolean; output?: string; error?: string }> {
        const engine = this.getEngine();

        try {
            const result = await engine.formatTypst(input, options);
            return result;
        } catch (error) {
            console.error('[ContentFormatterService] Typst format failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : t('Unknown error')
            };
        }
    }

    terminate(): void {
        if (this.engine) {
            this.engine.terminate();
            this.engine = null;
        }
    }

    showLoadingNotification(message: string, operationId?: string, type?: 'latex' | 'typst'): void {
        if (this.areNotificationsEnabled(type)) {
            notificationService.showLoading(message, operationId);
        }
    }

    showSuccessNotification(
        message: string,
        options: {
            operationId?: string;
            duration?: number;
            type?: 'latex' | 'typst';
        } = {}
    ): void {
        if (this.areNotificationsEnabled(options.type)) {
            notificationService.showSuccess(message, options);
        }
    }

    showErrorNotification(
        message: string,
        options: {
            operationId?: string;
            duration?: number;
            type?: 'latex' | 'typst';
        } = {}
    ): void {
        if (this.areNotificationsEnabled(options.type)) {
            notificationService.showError(message, options);
        }
    }

    private areNotificationsEnabled(type?: 'latex' | 'typst'): boolean {
        const userId = localStorage.getItem('texlyre-current-user');
        const storageKey = userId
            ? `texlyre-user-${userId}-settings`
            : 'texlyre-settings';
        try {
            const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (type === 'latex') {
                return settings['formatter-latex-notifications'] !== false;
            }
            if (type === 'typst') {
                return settings['formatter-typst-notifications'] !== false;
            }
            return settings['formatter-latex-notifications'] !== false ||
                settings['formatter-typst-notifications'] !== false;
        } catch {
            return true;
        }
    }
}

export const contentFormatterService = new ContentFormatterService();