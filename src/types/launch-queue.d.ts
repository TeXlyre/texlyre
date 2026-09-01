// src/types/launch-queue.d.ts
interface LaunchParams {
	targetURL?: string;
	files: FileSystemFileHandle[];
}

interface LaunchQueue {
	setConsumer(consumer: (params: LaunchParams) => void): void;
}

interface Window {
	launchQueue?: LaunchQueue;
}
