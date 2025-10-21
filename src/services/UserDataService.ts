// src/services/UserDataService.ts
export type UserDataType = 'settings' | 'properties' | 'secrets' | 'all';

export interface UserDataExport {
    settings?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    secrets?: Record<string, unknown>;
}

class UserDataService {
    private getStorageKey(userId: string, type: UserDataType): string {
        if (type === 'all') return '';
        return `texlyre-user-${userId}-${type}`;
    }

    async exportUserData(userId: string, type: UserDataType): Promise<UserDataExport> {
        const data: UserDataExport = {};

        if (type === 'settings' || type === 'all') {
            const settingsData = localStorage.getItem(`texlyre-user-${userId}-settings`);
            if (settingsData) {
                data.settings = JSON.parse(settingsData);
            }
        }

        if (type === 'properties' || type === 'all') {
            const propertiesData = localStorage.getItem(`texlyre-user-${userId}-properties`);
            if (propertiesData) {
                data.properties = JSON.parse(propertiesData);
            }
        }

        if (type === 'secrets' || type === 'all') {
            const secretsData = localStorage.getItem(`texlyre-user-${userId}-secrets`);
            if (secretsData) {
                data.secrets = JSON.parse(secretsData);
            }
        }

        return data;
    }

    async importUserData(userId: string, data: UserDataExport): Promise<void> {
        if (data.settings && Object.keys(data.settings).length > 0) {
            const settingsKey = `texlyre-user-${userId}-settings`;
            localStorage.setItem(settingsKey, JSON.stringify(data.settings));
        }

        if (data.properties && Object.keys(data.properties).length > 0) {
            const propertiesKey = `texlyre-user-${userId}-properties`;
            localStorage.setItem(propertiesKey, JSON.stringify(data.properties));
        }

        if (data.secrets && Object.keys(data.secrets).length > 0) {
            const secretsKey = `texlyre-user-${userId}-secrets`;
            localStorage.setItem(secretsKey, JSON.stringify(data.secrets));
        }
    }

    async clearUserData(userId: string, type: UserDataType): Promise<void> {
        if (type === 'settings' || type === 'all') {
            localStorage.removeItem(`texlyre-user-${userId}-settings`);
        }

        if (type === 'properties' || type === 'all') {
            localStorage.removeItem(`texlyre-user-${userId}-properties`);
        }

        if (type === 'secrets' || type === 'all') {
            localStorage.removeItem(`texlyre-user-${userId}-secrets`);
        }
    }

    async downloadUserData(userId: string, type: UserDataType): Promise<void> {
        const data = await this.exportUserData(userId, type);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = type === 'all'
            ? `userdata-all-${timestamp}.json`
            : `userdata-${type}-${timestamp}.json`;

        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async importFromFile(userId: string, file: File): Promise<void> {
        const text = await file.text();
        const data = JSON.parse(text) as UserDataExport;
        await this.importUserData(userId, data);
    }
}

export const userDataService = new UserDataService();