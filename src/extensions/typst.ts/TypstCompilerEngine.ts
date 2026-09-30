// src/extensions/typst.ts/TypstCompilerEngine.ts
import { nanoid } from 'nanoid';

import type { TypstOutputFormat, TypstPdfOptions } from '../../types/typst';

type TypstCompileWorkerOptions = {
	allowRemoteUrls?: boolean;
	buildSourceMap?: boolean;
};

type TypstCompilePayload = {
	mainFilePath: string;
	sources: Record<string, string | Uint8Array>;
	format: TypstOutputFormat;
	pdfOptions?: TypstPdfOptions;
	options?: TypstCompileWorkerOptions;
};

export type TypstWorkerMessage =
	| { id: string; type: 'compile'; payload: TypstCompilePayload }
	| { id: string; type: 'ping' };

export type TypstWorkerResponse =
	| { id: string; type: 'pong' }
	| {
			id: string;
			type: 'done';
			result: {
				format: string;
				output: Uint8Array | string;
				sourceMapArtifact?: Uint8Array;
				diagnostics?: any[];
			};
	  }
	| { id: string; type: 'error'; error: string };

export class TypstCompilerEngine {
	private worker: Worker | null = null;
	private pendingResolves = new Map<string, (value: any) => void>();
	private pendingRejects = new Map<string, (error: any) => void>();

	async ping(): Promise<void> {
		await this.callWorker('ping', undefined);
	}

	async compile(
		mainFilePath: string,
		sources: Record<string, string | Uint8Array>,
		format: TypstOutputFormat,
		pdfOptions?: TypstPdfOptions,
		signal?: AbortSignal,
		options?: TypstCompileWorkerOptions,
	): Promise<{
		format: string;
		output: Uint8Array | string;
		sourceMapArtifact?: Uint8Array;
		diagnostics?: any[];
	}> {
		return this.callWorker(
			'compile',
			{ mainFilePath, sources, format, pdfOptions, options },
			signal,
		);
	}

	terminate(): void {
		this.worker?.terminate();
		this.worker = null;
		const error = new Error('Compilation was cancelled');
		for (const reject of this.pendingRejects.values()) reject(error);
		this.pendingResolves.clear();
		this.pendingRejects.clear();
	}

	private getWorker(): Worker {
		if (this.worker) return this.worker;

		const worker = new Worker(new URL('./typst-worker.ts', import.meta.url), {
			type: 'module',
		});

		worker.onmessage = (event: MessageEvent<TypstWorkerResponse>) => {
			const { id, type } = event.data;
			if (!id) return;

			if (type === 'done' || type === 'pong') {
				this.pendingResolves.get(id)?.(
					'result' in event.data ? event.data.result : undefined,
				);
			} else {
				this.pendingRejects.get(id)?.(
					new Error(event.data.error || 'Typst worker error'),
				);
			}

			this.pendingResolves.delete(id);
			this.pendingRejects.delete(id);
		};

		worker.onerror = (event) => {
			const error = new Error(
				`Typst worker error: ${String(event.message || event)}`,
			);
			for (const reject of this.pendingRejects.values()) reject(error);
			this.pendingResolves.clear();
			this.pendingRejects.clear();
			if (this.worker === worker) this.worker = null;
		};

		this.worker = worker;
		return worker;
	}

	private callWorker<TType extends 'compile' | 'ping'>(
		type: TType,
		payload: TType extends 'compile' ? TypstCompilePayload : undefined,
		signal?: AbortSignal,
	): Promise<any> {
		const id = nanoid();
		const worker = this.getWorker();

		return new Promise((resolve, reject) => {
			let settled = false;

			const finishResolve = (value: any) => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener('abort', abort);
				resolve(value);
			};
			const finishReject = (error: any) => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener('abort', abort);
				reject(error);
			};
			const abort = () => {
				this.pendingResolves.delete(id);
				this.pendingRejects.delete(id);
				if (this.worker === worker) {
					worker.terminate();
					this.worker = null;
				}
				finishReject(new Error('Compilation was cancelled'));
			};

			this.pendingResolves.set(id, finishResolve);
			this.pendingRejects.set(id, finishReject);

			if (signal?.aborted) {
				abort();
				return;
			}
			signal?.addEventListener('abort', abort, { once: true });
			worker.postMessage({ id, type, payload });
		});
	}
}
