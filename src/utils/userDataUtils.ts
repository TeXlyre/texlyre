// src/utils/userDataUtils.ts

export type UserDataType = 'settings' | 'properties' | 'secrets' | 'all';

export const getUserDataKey = (userId: string, type: Exclude<UserDataType, 'all'>): string => {
  return `texlyre-user-${userId}-${type}`;
};

export const getUserData = <T = any>(userId: string, type: Exclude<UserDataType, 'all'>): T | null => {
  const key = getUserDataKey(userId, type);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
};

export const setUserData = (userId: string, type: Exclude<UserDataType, 'all'>, data: any): void => {
  const key = getUserDataKey(userId, type);
  localStorage.setItem(key, JSON.stringify(data));
};

export const clearUserData = (userId: string, type: UserDataType): void => {
  if (type === 'all') {
    ['settings', 'properties', 'secrets'].forEach(t => {
      localStorage.removeItem(getUserDataKey(userId, t as Exclude<UserDataType, 'all'>));
    });
  } else {
    localStorage.removeItem(getUserDataKey(userId, type));
  }
};

export const exportUserData = (userId: string, type: UserDataType): any => {
  if (type === 'all') {
    return {
      settings: getUserData(userId, 'settings'),
      properties: getUserData(userId, 'properties'),
      secrets: getUserData(userId, 'secrets')
    };
  }
  return getUserData(userId, type);
};

export const importUserData = (userId: string, data: any): void => {
  if (data.settings) {
    setUserData(userId, 'settings', data.settings);
  }
  if (data.properties) {
    setUserData(userId, 'properties', data.properties);
  }
  if (data.secrets) {
    setUserData(userId, 'secrets', data.secrets);
  }
};

export const downloadUserData = async (userId: string, type: UserDataType): Promise<void> => {
  const data = exportUserData(userId, type);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `texlyre-userdata-${type}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const importFromFile = async (userId: string, file: File): Promise<void> => {
  const text = await file.text();
  const data = JSON.parse(text);
  importUserData(userId, data);
};