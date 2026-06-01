// src/utils/authUtils.ts
import { t } from '@/i18n';

export function validateUsername(username: string): string | null {
	if (!username) return t('Please fill out all required fields');
	return null;
}

export function validatePassword(password: string): string | null {
	if (!password) return t('Please fill out all required fields');
	if (password.length < 6)
		return t('Password must be at least 6 characters long');
	return null;
}

export function validateEmail(email: string): string | null {
	if (email && !/\S+@\S+\.\S+/.test(email))
		return t('Please enter a valid email address');
	return null;
}
