import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parse } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface OidcConfig {
  issuer: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  logoutUrl?: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

interface BackendConfig {
  port: number;
  siteUrl: string;
  frontendUrl: string;
  allowedOrigins: string[];
  oidc: OidcConfig;
}

interface OidcTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

interface OidcSession {
  user: Record<string, unknown>;
  tokenData: OidcTokenResponse;
  expiresAt: number;
}

const sessions = new Map<string, OidcSession>();
const pendingStates = new Map<string, number>();
const SESSION_COOKIE = 'texlyre-session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const loadEnv = async (): Promise<void> => {
  const envPath = resolve(process.cwd(), '.env');
  try {
    const contents = await readFile(envPath, 'utf8');
    const lines = contents.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...values] = trimmed.split('=');
      if (!key) continue;
      const value = values.join('=').trim();
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing .env
  }
};

const getEnv = (key: string, fallback?: string): string | undefined => {
  return process.env[key] ?? fallback;
};

const requireEnv = (key: string): string => {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

const parseList = (value: string | undefined, fallback: string[] = []): string[] => {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const isLocalhostUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

const getCorsHeaders = (originHeader: string | undefined, allowedOrigins: string[]) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (originHeader && allowedOrigins.includes(originHeader)) {
    headers['Access-Control-Allow-Origin'] = originHeader;
    headers['Vary'] = 'Origin';
  }

  return headers;
};

const parseCookies = (req: IncomingMessage): Record<string, string> => {
  const cookieHeader = req.headers.cookie || '';
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[name] = value;
  }
  return cookies;
};

const buildSessionCookie = (sessionId: string, siteUrl: string): string => {
  const secure = siteUrl.startsWith('https://') || isLocalhostUrl(siteUrl);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=None',
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
};

const clearSessionCookie = (siteUrl: string): string => {
  const secure = siteUrl.startsWith('https://') || isLocalhostUrl(siteUrl);
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=None',
    'Max-Age=0',
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
};

const getCallbackUrl = (config: BackendConfig): string =>
  `${config.siteUrl.replace(/\/$/, '')}/api/auth/oidc/callback`;

const sendJson = (res: ServerResponse, body: unknown, status = 200, headers: Record<string, string> = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...headers,
  });
  res.end(payload);
};

const sendRedirect = (res: ServerResponse, location: string, headers: Record<string, string> = {}) => {
  res.writeHead(302, {
    Location: location,
    ...headers,
  });
  res.end();
};

const parseBody = async (req: IncomingMessage): Promise<any> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const createConfig = (): BackendConfig => {
  const port = Number(getEnv('BACKEND_PORT', '4000')) || 4000;
  const siteUrl = getEnv('SITE_URL', `http://localhost:${port}`) as string;
  const frontendUrl = getEnv('FRONTEND_URL', 'http://localhost:5173/texlyre/') as string;
  const allowedOrigins = parseList(getEnv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'));

  return {
    port,
    siteUrl,
    frontendUrl,
    allowedOrigins,
    oidc: {
      issuer: requireEnv('OIDC_ISSUER'),
      authorizationUrl: requireEnv('OIDC_AUTHORIZATION_URL'),
      tokenUrl: requireEnv('OIDC_TOKEN_URL'),
      userInfoUrl: requireEnv('OIDC_USER_INFO_URL'),
      logoutUrl: getEnv('OIDC_LOGOUT_URL'),
      clientId: requireEnv('OIDC_CLIENT_ID'),
      clientSecret: requireEnv('OIDC_CLIENT_SECRET'),
      scope: getEnv('OIDC_SCOPE', 'openid email profile') as string,
    },
  };
};

const exchangeCodeForToken = async (
  config: BackendConfig,
  code: string,
  redirectUri: string,
): Promise<OidcTokenResponse> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.oidc.clientId,
    client_secret: config.oidc.clientSecret,
  });

  const response = await fetch(config.oidc.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Token exchange failed ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as OidcTokenResponse;
};

const getUserInfo = async (config: BackendConfig, accessToken: string): Promise<Record<string, unknown>> => {
  const response = await fetch(config.oidc.userInfoUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Failed to fetch user info ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as Record<string, unknown>;
};

const getAuthorizationUrl = (config: BackendConfig, state: string): string => {
  const url = new URL(config.oidc.authorizationUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.oidc.clientId);
  url.searchParams.set('redirect_uri', getCallbackUrl(config));
  url.searchParams.set('scope', config.oidc.scope);
  url.searchParams.set('state', state);
  return url.toString();
};

const cleanupExpiredStates = (): void => {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates) {
    if (expiresAt < now) pendingStates.delete(state);
  }
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(sessionId);
  }
};

const startServer = async () => {
  await loadEnv();
  const config = createConfig();
  cleanupExpiredStates();

  const server = createServer(async (req, res) => {
    const url = parse(req.url || '', true);
    const method = (req.method || 'GET').toUpperCase();
    const origin = req.headers.origin;
    const corsHeaders = getCorsHeaders(origin, config.allowedOrigins);

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (method === 'GET' && url.pathname === '/health') {
      sendJson(res, { status: 'ok' }, 200, corsHeaders);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/oidc/authorize') {
      const state = randomUUID();
      pendingStates.set(state, Date.now() + 10 * 60 * 1000);
      const authUrl = getAuthorizationUrl(config, state);
      sendRedirect(res, authUrl, corsHeaders);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/oidc/callback') {
      const code = url.query.code as string | undefined;
      const state = url.query.state as string | undefined;
      const error = url.query.error as string | undefined;

      if (error) {
        const errorDescription = (url.query.error_description as string) || error;
        sendRedirect(res, `${config.frontendUrl}?oidc=error&message=${encodeURIComponent(errorDescription)}`);
        return;
      }

      if (!code || !state) {
        sendError(res, 'Missing code or state', 400, corsHeaders);
        return;
      }

      const pending = pendingStates.get(state);
      if (!pending || pending < Date.now()) {
        sendError(res, 'Invalid or expired state', 400, corsHeaders);
        return;
      }
      pendingStates.delete(state);

      try {
        const tokenData = await exchangeCodeForToken(config, code, getCallbackUrl(config));
        const userInfo = await getUserInfo(config, tokenData.access_token);

        const externalUserId = String(
          userInfo.sub ?? userInfo.preferred_username ?? userInfo.email ?? randomUUID(),
        );
        const user = {
          id: externalUserId,
          username: String(userInfo.preferred_username ?? userInfo.email ?? externalUserId),
          email: typeof userInfo.email === 'string' ? userInfo.email : undefined,
          authProvider: config.oidc.clientId,
          metadata: userInfo,
          createdAt: Date.now(),
          lastLogin: Date.now(),
        };

        const sessionId = randomUUID();
        sessions.set(sessionId, {
          user,
          tokenData,
          expiresAt: Date.now() + SESSION_TTL_MS,
        });

        sendRedirect(res, config.frontendUrl, {
          ...corsHeaders,
          'Set-Cookie': buildSessionCookie(sessionId, config.siteUrl),
        });
      } catch (serverError) {
        const message = (serverError as Error).message;
        sendRedirect(res, `${config.frontendUrl}?oidc=error&message=${encodeURIComponent(message)}`);
      }
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/session') {
      const cookies = parseCookies(req);
      const sessionId = cookies[SESSION_COOKIE];
      if (!sessionId) {
        sendJson(res, { error: 'No session' }, 401, corsHeaders);
        return;
      }
      const session = sessions.get(sessionId);
      if (!session || session.expiresAt < Date.now()) {
        sessions.delete(sessionId);
        sendJson(res, { error: 'Session expired' }, 401, corsHeaders);
        return;
      }
      sendJson(res, { user: session.user, tokenData: session.tokenData }, 200, corsHeaders);
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/logout') {
      const cookies = parseCookies(req);
      const sessionId = cookies[SESSION_COOKIE];
      if (sessionId) {
        sessions.delete(sessionId);
      }
      res.writeHead(200, {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie(config.siteUrl),
      });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    sendJson(res, { error: 'Not found' }, 404, corsHeaders);
  });

  server.listen(config.port, () => {
    console.log(`Backend ready at ${config.siteUrl}`);
    console.log(`OIDC authorize endpoint: ${config.siteUrl.replace(/\/$/, '')}/api/auth/oidc/authorize`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
