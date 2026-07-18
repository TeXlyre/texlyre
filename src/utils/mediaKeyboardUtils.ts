// src/utils/mediaKeyboardUtils.ts
const VOLUME_STEP = 0.1;
const SEEK_STEP = 5;

export function applyMediaKey(media: HTMLMediaElement, key: string): boolean {
	switch (key) {
		case 'm':
		case 'M':
			media.muted = !media.muted;
			return true;
		case 'ArrowUp':
			media.volume = Math.min(1, media.volume + VOLUME_STEP);
			if (media.volume > 0) media.muted = false;
			return true;
		case 'ArrowDown':
			media.volume = Math.max(0, media.volume - VOLUME_STEP);
			return true;
		case 'ArrowLeft':
			media.currentTime = Math.max(0, media.currentTime - SEEK_STEP);
			return true;
		case 'ArrowRight':
			media.currentTime = Math.min(
				media.duration || media.currentTime + SEEK_STEP,
				media.currentTime + SEEK_STEP,
			);
			return true;
		default:
			return false;
	}
}
