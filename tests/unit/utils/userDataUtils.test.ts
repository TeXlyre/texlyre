import {
    getUserDataKey,
    getUserData,
    setUserData,
    clearUserData,
    exportUserData,
    importUserData,
    importFromFile,
} from '@src/utils/userDataUtils';

describe('User Data Utils', () => {
    const userId = 'user123';

    beforeEach(() => {
        localStorage.clear();
    });

    describe('getUserDataKey', () => {
        it('should build a namespaced key', () => {
            expect(getUserDataKey(userId, 'settings')).toBe(
                'texlyre-user-user123-settings',
            );
        });
    });

    describe('getUserData / setUserData', () => {
        it('should round-trip stored data', () => {
            setUserData(userId, 'settings', { theme: 'dark' });

            expect(getUserData(userId, 'settings')).toEqual({ theme: 'dark' });
        });

        it('should return null for missing data', () => {
            expect(getUserData(userId, 'records')).toBeNull();
        });
    });

    describe('clearUserData', () => {
        it('should clear a single type', () => {
            setUserData(userId, 'settings', { a: 1 });
            setUserData(userId, 'secrets', { b: 2 });

            clearUserData(userId, 'settings');

            expect(getUserData(userId, 'settings')).toBeNull();
            expect(getUserData(userId, 'secrets')).toEqual({ b: 2 });
        });

        it('should clear all types', () => {
            setUserData(userId, 'settings', { a: 1 });
            setUserData(userId, 'properties', { b: 2 });
            setUserData(userId, 'secrets', { c: 3 });
            setUserData(userId, 'records', { d: 4 });

            clearUserData(userId, 'all');

            expect(getUserData(userId, 'settings')).toBeNull();
            expect(getUserData(userId, 'properties')).toBeNull();
            expect(getUserData(userId, 'secrets')).toBeNull();
            expect(getUserData(userId, 'records')).toBeNull();
        });
    });

    describe('exportUserData', () => {
        it('should export a single type', () => {
            setUserData(userId, 'settings', { theme: 'light' });

            expect(exportUserData(userId, 'settings')).toEqual({ theme: 'light' });
        });

        it('should export all types as a combined object', () => {
            setUserData(userId, 'settings', { a: 1 });
            setUserData(userId, 'records', { d: 4 });

            const exported = exportUserData(userId, 'all');

            expect(exported).toEqual({
                settings: { a: 1 },
                properties: null,
                secrets: null,
                records: { d: 4 },
            });
        });
    });

    describe('importUserData', () => {
        it('should import only present keys', () => {
            importUserData(userId, { settings: { a: 1 }, secrets: { c: 3 } });

            expect(getUserData(userId, 'settings')).toEqual({ a: 1 });
            expect(getUserData(userId, 'secrets')).toEqual({ c: 3 });
            expect(getUserData(userId, 'properties')).toBeNull();
        });
    });

    describe('importFromFile', () => {
        it('should parse a file and import its data', async () => {
            const file = {
                text: async () => JSON.stringify({ properties: { x: 1 } }),
            } as File;

            await importFromFile(userId, file);

            expect(getUserData(userId, 'properties')).toEqual({ x: 1 });
        });
    });
});