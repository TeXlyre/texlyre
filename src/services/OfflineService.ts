// src/services/OfflineService.ts
const BASE_PATH = __BASE_PATH__;
const LAST_ONLINE_KEY = 'texlyre-last-online';

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
		lastOnline: Number(localStorage.getItem(LAST_ONLINE_KEY)) || null,
	};

	constructor() {
		window.addEventListener('online', this.refreshStatus);
		window.addEventListener('offline', this.refreshStatus);
	}

	refreshStatus = async (): Promise<void> => {
		let isOnline = navigator.onLine;

		if (isOnline && !this.forceOffline) {
			try {
				await fetch(`${BASE_PATH}/index.html?offline-check=${Date.now()}`, {
					method: 'HEAD',
					cache: 'no-store',
				});
			} catch {
				isOnline = false;
			}
		}

		if (isOnline && !this.forceOffline) {
			localStorage.setItem(LAST_ONLINE_KEY, Date.now().toString());
		}

		this.status = {
			isOnline: this.forceOffline ? false : isOnline,
			lastOnline:
				isOnline && !this.forceOffline ? Date.now() : this.status.lastOnline,
		};

		this.notifyListeners();
	};

	setForceOffline(forceOffline: boolean): void {
		this.forceOffline = forceOffline;
		this.notifyServiceWorker();
		void this.refreshStatus();
	}

	setAirgapExternalRequests(enabled: boolean): void {
		this.airgapExternalRequests = enabled;
		this.notifyServiceWorker();
		this.notifyListeners();
	}

	syncServiceWorkerState(): void {
		this.notifyServiceWorker();
	}

	getStatus(): OfflineStatus {
		return {
			...this.status,
			airgapExternalRequests: this.airgapExternalRequests,
		};
	}

	addStatusListener(callback: (status: OfflineStatus) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private notifyServiceWorker(): void {
		if (!navigator.serviceWorker?.controller) return;

		navigator.serviceWorker.controller.postMessage({
			type: 'SET_FORCE_OFFLINE_MODE',
			enabled: this.forceOffline,
		});

		navigator.serviceWorker.controller.postMessage({
			type: 'SET_AIRGAP_EXTERNAL_REQUESTS',
			enabled: this.airgapExternalRequests,
		});
	}

	private notifyListeners(): void {
		this.listeners.forEach((callback) => { callback(this.getStatus())); }
	}

	cleanup(): void {
		window.removeEventListener('online', this.refreshStatus);
		window.removeEventListener('offline', this.refreshStatus);
	}
}

export const offlineService = new OfflineService();
