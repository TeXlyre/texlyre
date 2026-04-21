export interface BackendTokenPayload {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type: string;
}

export interface BackendAuthResponse {
  user: Record<string, unknown>;
  tokenData: BackendTokenPayload;
}

const BACKEND_BASE_URL =
  import.meta.env.VITE_BACKEND_URL ?? '';
const BACKEND_AUTH_ENABLED =
  import.meta.env.VITE_BACKEND_AUTH_ENABLED === 'true';

const getBackendApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_BASE_URL.replace(/\/$/, '')}${normalizedPath}`;
};

const backendFetch = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(getBackendApiUrl(path), {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': options.body !== undefined ? 'application/json' : '',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Backend request failed ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as T;
};

export const isBackendAuthEnabled = (): boolean =>
  BACKEND_AUTH_ENABLED || Boolean(BACKEND_BASE_URL);

export const initiateOidcLogin = (): void => {
  if (!isBackendAuthEnabled()) {
    throw new Error('Backend auth is not enabled');
  }

  window.location.href = getBackendApiUrl('/api/auth/oidc/authorize');
};

export const getOidcSession = async (): Promise<BackendAuthResponse | null> => {
  if (!isBackendAuthEnabled()) {
    return null;
  }

  const response = await fetch(getBackendApiUrl('/api/auth/session'), {
    credentials: 'include',
  });

  if (response.status === 401 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Backend request failed ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as BackendAuthResponse;
};

export const backendLogout = async (): Promise<void> => {
  if (!isBackendAuthEnabled()) {
    return;
  }

  await backendFetch('/api/auth/logout', {
    method: 'POST',
  });
};
