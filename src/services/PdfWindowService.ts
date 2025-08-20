// src/services/PdfWindowService.ts
interface PdfMessage {
	type: 'pdf-update' | 'pdf-clear' | 'window-ready' | 'window-closed';
	data?: {
		pdf?: Uint8Array;
		fileName?: string;
		projectName?: string;
		compileLog?: string;
		status?: number;
	};
	timestamp: number;
}

class PdfWindowService {
	private channel: BroadcastChannel | null = null;
	private pdfWindow: Window | null = null;
	private projectId: string | null = null;
	private listeners: Set<(message: PdfMessage) => void> = new Set();

	initialize(projectId: string): void {
		this.projectId = projectId;
		this.channel = new BroadcastChannel(`texlyre-pdf-${projectId}`);

		this.channel.addEventListener('message', (event) => {
			const message = event.data as PdfMessage;
			this.listeners.forEach(listener => listener(message));
		});
	}

	openPdfWindow(): boolean {
		if (!this.projectId) return false;

		const baseUrl = window.location.origin + window.location.pathname;
		const pdfUrl = `${baseUrl}#pdf-viewer:${this.projectId}`;

		if (this.pdfWindow && !this.pdfWindow.closed) {
			this.pdfWindow.focus();
			return true;
		}

		this.pdfWindow = window.open(
			pdfUrl,
			`texlyre-pdf-${this.projectId}`,
			'width=1000,height=800,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no'
		);

		if (this.pdfWindow) {
			const checkClosed = () => {
				if (this.pdfWindow?.closed) {
					this.pdfWindow = null;
					this.sendMessage({ type: 'window-closed', timestamp: Date.now() });
				} else {
					setTimeout(checkClosed, 1000);
				}
			};
			setTimeout(checkClosed, 1000);
			return true;
		}

		return false;
	}

	sendPdfUpdate(pdf: Uint8Array, fileName?: string, projectName?: string): void {
		this.sendMessage({
			type: 'pdf-update',
			data: { pdf, fileName, projectName },
			timestamp: Date.now()
		});
	}

	sendCompileResult(status: number, compileLog: string): void {
		this.sendMessage({
			type: 'pdf-update',
			data: { status, compileLog },
			timestamp: Date.now()
		});
	}

	clearPdf(): void {
		this.sendMessage({
			type: 'pdf-clear',
			timestamp: Date.now()
		});
	}

	isWindowOpen(): boolean {
		return this.pdfWindow && !this.pdfWindow.closed;
	}

	closeWindow(): void {
		if (this.pdfWindow && !this.pdfWindow.closed) {
			this.pdfWindow.close();
			this.pdfWindow = null;
		}
	}

	addListener(listener: (message: PdfMessage) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private sendMessage(message: PdfMessage): void {
		if (this.channel) {
			this.channel.postMessage(message);
		}
	}

	cleanup(): void {
		this.closeWindow();
		if (this.channel) {
			this.channel.close();
			this.channel = null;
		}
		this.listeners.clear();
		this.projectId = null;
	}
}

export const pdfWindowService = new PdfWindowService();