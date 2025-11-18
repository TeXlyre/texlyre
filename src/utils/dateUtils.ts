// src/utils/dateUtils.ts
import { t } from '@/i18n';
import i18next from 'i18next';

export const formatDate = (timestamp: number | string): string => {
	const date = new Date(typeof timestamp === 'string' && !isNaN(Number(timestamp)) ? parseInt(timestamp, 10) : timestamp);
	return date.toLocaleString(i18next.language);
};

export const formatLastModified = (timestamp: number | string) => {
	const date = new Date(typeof timestamp === 'string' && !isNaN(Number(timestamp)) ? parseInt(timestamp, 10) : timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return t('Today');
	if (diffDays === 1) return t('Yesterday');
	if (diffDays < 7) return t(`{count} day ago`, { count: diffDays });
	return date.toLocaleDateString(i18next.language);
};

export const formatTimestamp = (timestamp: number | string): string => {
	const ts = typeof timestamp === 'string' && !isNaN(Number(timestamp))
		? parseInt(timestamp, 10)
		: timestamp;

	const now = Date.now();
	const diff = now - (typeof ts === 'number' ? ts : 0);

	if (diff < 60000) {
		return t('Just now');
	}
	if (diff < 3600000) {
		const minutes = Math.floor(diff / 60000);
		return t(`{count}m ago`, { count: minutes });
	}
	if (diff < 86400000) {
		const hours = Math.floor(diff / 3600000);
		return t(`{count}h ago`, { count: hours });
	}

	return new Date(ts).toLocaleDateString(i18next.language);
};
