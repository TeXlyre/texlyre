// src/services/OfflineService.ts
export interface OfflineStatus {
	isOnline: boolean;
	lastOnline: number | null;
}

class OfflineService {
	private listeners = new Set<(status: OfflineStatus) => void>();
	private status: OfflineStatus = {
		isOnline: navigator.onLine,
		lastOnline: navigator.onLine ? Date.now() : null,
	};

	constructor() {
		window.addEventListener("online", this.handleOnline);
		window.addEventListener("offline", this.handleOffline);
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

	getStatus(): OfflineStatus {
		return { ...this.status };
	}

	addStatusListener(callback: (status: OfflineStatus) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private notifyListeners() {
		this.listeners.forEach((callback) => callback(this.getStatus()));
	}

	cleanup() {
		window.removeEventListener("online", this.handleOnline);
		window.removeEventListener("offline", this.handleOffline);
	}
}

export const offlineService = new OfflineService();
