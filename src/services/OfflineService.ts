// src/services/OfflineService.ts
export interface OfflineStatus {
	isOnline: boolean;
	lastOnline: number | null;
	airgapExternalRequests: boolean;
}

class OfflineService {
	private listeners = new Set<(status: OfflineStatus) => void>();

	private forceOffline = false;
	private airgapExternalRequests = false;

	private status: Omit<OfflineStatus, 'airgapExternalRequests'> = {
		isOnline: navigator.onLine,
		lastOnline: navigator.onLine ? Date.now() : null,
	};

	constructor() {
		window.addEventListener('online', this.handleOnline);
		window.addEventListener('offline', this.handleOffline);
	}

	private handleOnline = () => {
		this.status = {
			isOnline: true,
			lastOnline: Date.now(),
		};
		this.notifyListeners();
	};

	private handleOffline = () => {
		this.status = {
			...this.status,
			isOnline: false,
		};
		this.notifyListeners();
	};

	setForceOffline(forceOffline: boolean): void {
		this.forceOffline = forceOffline;
		this.notifyForceOfflineMode();
		this.notifyListeners();
	}

	private notifyForceOfflineMode(): void {
		if (!navigator.serviceWorker?.controller) return;

		navigator.serviceWorker.controller.postMessage({
			type: 'SET_FORCE_OFFLINE_MODE',
			enabled: this.forceOffline,
		});
	}

	setAirgapExternalRequests(enabled: boolean): void {
		this.airgapExternalRequests = enabled;
		this.notifyServiceWorker();
		this.notifyListeners();
	}

	private notifyServiceWorker(): void {
		if (!navigator.serviceWorker?.controller) return;

		navigator.serviceWorker.controller.postMessage({
			type: 'SET_AIRGAP_EXTERNAL_REQUESTS',
			enabled: this.airgapExternalRequests,
		});
	}

	syncServiceWorkerState(): void {
		this.notifyForceOfflineMode();
		this.notifyServiceWorker();
	}

	getStatus(): OfflineStatus {
		return {
			...this.status,
			isOnline: this.forceOffline ? false : this.status.isOnline,
			airgapExternalRequests: this.airgapExternalRequests,
		};
	}

	addStatusListener(callback: (status: OfflineStatus) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private notifyListeners() {
		this.listeners.forEach((callback) => callback(this.getStatus()));
	}

	cleanup() {
		window.removeEventListener('online', this.handleOnline);
		window.removeEventListener('offline', this.handleOffline);
	}
}

export const offlineService = new OfflineService();
