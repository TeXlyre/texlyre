// src/utils/dateUtils.ts
export const formatDate = (timestamp: number): string => {
	const date = new Date(timestamp);
	return date.toLocaleString();
};
