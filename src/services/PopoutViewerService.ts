// src/services/PopoutViewerService.ts
export type PopoutContentKind = 'pdf' | 'canvas-pdf' | 'canvas-svg';

export interface PopoutPayload {
	kind: PopoutContentKind;
	content: Uint8Array | ArrayBuffer | string;
	mimeType: string;
	fileName?: string;
	projectName?: string;
}

interface PopoutMessage {
	type: 'content-update' | 'content-clear' | 'window-ready' | 'window-closed';
	data?: Partial<PopoutPayload> & {
		compileLog?: string;
		status?: number;
	};
	timestamp: number;
}

class PopoutViewerService {
	private channel: BroadcastChannel | null = null;
	private popoutWindow: Window | null = null;
	private projectId: string | null = null;
	private listeners = new Set<(message: PopoutMessage) => void>();
	private lastContent: PopoutPayload | null = null;
	private lastCompileResult: { status: number; compileLog: string } | null =
		null;

	initialize(projectId: string): void {
		if (this.projectId === projectId && this.channel) return;
		this.cleanup();
		this.projectId = projectId;
		this.channel = new BroadcastChannel(`texlyre-popout-${projectId}`);
		this.channel.addEventListener('message', (event) => {
			const message = event.data as PopoutMessage;
			if (message.type === 'window-ready') {
				if (this.lastContent) {
					this.sendMessage({
						type: 'content-update',
						data: this.lastContent,
						timestamp: Date.now(),
					});
				} else if (this.lastCompileResult) {
					this.sendMessage({
						type: 'content-update',
						data: this.lastCompileResult,
						timestamp: Date.now(),
					});
				}
			}
			for (const listener of this.listeners) listener(message);
		});
	}

	openWindow(): boolean {
		if (!this.projectId) return false;

		const baseUrl = window.location.origin + window.location.pathname;
		const popoutUrl = `${baseUrl}#popout-viewer:${this.projectId}`;
		if (this.isWindowOpen()) {
			this.popoutWindow?.focus();
			return true;
		}

		this.popoutWindow = window.open(
			popoutUrl,
			`texlyre-popout-${this.projectId}`,
			'width=1000,height=800,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no',
		);

		if (!this.popoutWindow) return false;

		const checkClosed = () => {
			if (this.popoutWindow?.closed) {
				this.popoutWindow = null;
				this.sendMessage({ type: 'window-closed', timestamp: Date.now() });
				return;
			}
			setTimeout(checkClosed, 1000);
		};
		setTimeout(checkClosed, 1000);
		return true;
	}

	sendContent(payload: PopoutPayload): void {
		this.lastContent = payload;
		this.lastCompileResult = null;
		if (!this.isWindowOpen()) return;
		this.sendMessage({
			type: 'content-update',
			data: payload,
			timestamp: Date.now(),
		});
	}

	sendCompileResult(status: number, compileLog: string): void {
		this.lastContent = null;
		this.lastCompileResult = { status, compileLog };
		if (!this.isWindowOpen()) return;
		this.sendMessage({
			type: 'content-update',
			data: this.lastCompileResult,
			timestamp: Date.now(),
		});
	}

	clear(): void {
		this.lastContent = null;
		this.lastCompileResult = null;
		if (!this.isWindowOpen()) return;
		this.sendMessage({ type: 'content-clear', timestamp: Date.now() });
	}

	isWindowOpen(): boolean {
		return !!this.popoutWindow && !this.popoutWindow.closed;
	}

	closeWindow(): void {
		if (this.popoutWindow && !this.popoutWindow.closed)
			this.popoutWindow.close();
		this.popoutWindow = null;
	}

	addListener(listener: (message: PopoutMessage) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	cleanup(): void {
		this.closeWindow();
		this.channel?.close();
		this.channel = null;
		this.listeners.clear();
		this.lastContent = null;
		this.lastCompileResult = null;
		this.projectId = null;
	}

	private sendMessage(message: PopoutMessage): void {
		this.channel?.postMessage(message);
	}
}

export const popoutViewerService = new PopoutViewerService();
export type { PopoutMessage };
