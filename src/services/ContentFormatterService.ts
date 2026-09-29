// src/services/ContentFormatterService.ts
import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { WasmToolsEngine } from '../extensions/wasm-tools/WasmToolsEngine';
import type { TypstyleOptions } from '../extensions/wasm-tools/TypstyleEngine';
import {
	notificationService,
	shouldShowNotification,
} from './NotificationService';

const moduleLog = createNamedLogger('ContentFormatterService');

export interface LatexFormatOptions {
	wrap: boolean;
	wraplen: number;
	tabsize: number;
	usetabs: boolean;
}

export type TypstFormatOptions = Required<TypstyleOptions>;

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
		options: LatexFormatOptions,
	): Promise<{ success: boolean; output?: string; error?: string }> {
		const engine = this.getEngine();

		try {
			const result = await engine.formatLatex(input, options);
			return result;
		} catch (error) {
			moduleLog.error('LaTeX format failed:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : t('Unknown error'),
			};
		}
	}

	async formatTypst(
		input: string,
		options: TypstFormatOptions,
	): Promise<{ success: boolean; output?: string; error?: string }> {
		const engine = this.getEngine();

		try {
			const result = await engine.formatTypst(input, options);
			return result;
		} catch (error) {
			moduleLog.error('Typst format failed:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : t('Unknown error'),
			};
		}
	}

	terminate(): void {
		if (this.engine) {
			this.engine.terminate();
			this.engine = null;
		}
	}

	showLoadingNotification(
		message: string,
		operationId?: string,
		type?: 'latex' | 'typst',
	): void {
		if (this.canNotify(type, 'loading')) {
			notificationService.showLoading(message, operationId);
		}
	}

	showSuccessNotification(
		message: string,
		options: {
			operationId?: string;
			duration?: number;
			type?: 'latex' | 'typst';
		} = {},
	): void {
		if (this.canNotify(options.type, 'success')) {
			notificationService.showSuccess(message, options);
		}
	}

	showErrorNotification(
		message: string,
		options: {
			operationId?: string;
			duration?: number;
			type?: 'latex' | 'typst';
		} = {},
	): void {
		if (this.canNotify(options.type, 'error')) {
			notificationService.showError(message, options);
		}
	}

	private canNotify(
		type: 'latex' | 'typst' | undefined,
		notificationType: 'loading' | 'success' | 'error',
	): boolean {
		if (type) {
			return shouldShowNotification(
				`formatter-${type}-notifications`,
				notificationType,
			);
		}
		return (
			shouldShowNotification(
				'formatter-latex-notifications',
				notificationType,
			) ||
			shouldShowNotification('formatter-typst-notifications', notificationType)
		);
	}
}

export const contentFormatterService = new ContentFormatterService();
