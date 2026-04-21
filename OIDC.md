# OIDC Integration for TeXlyre

This document explains the OpenID Connect (OIDC) authentication flow used by TeXlyre. It clarifies what TeXlyre does in the browser, what the backend must do, and which environment variables control the behavior.

## What OIDC means here

OpenID Connect is an authentication layer on top of OAuth2. In this setup:

- TeXlyre is the client-facing app.
- A backend service performs the OIDC authorization code flow with the identity provider.
- The backend keeps the client secret secure and issues a session cookie to the browser.
- The frontend uses the backend only to start login, restore the session, and logout.

That lets TeXlyre use external identity providers without storing secrets in the browser.

## What TeXlyre does now

The current frontend and backend work together like this:

1. User opens the TeXlyre login screen.
2. The login UI shows a provider button when backend auth is enabled.
3. The user clicks the button.
4. The frontend redirects the browser to `GET ${VITE_BACKEND_URL}/api/auth/oidc/authorize`.
5. The backend redirects the browser to the OIDC provider (Keycloak in your case).
6. After login, the provider redirects back to the backend callback.
7. The backend exchanges the authorization code for tokens and fetches user info.
8. The backend creates a local session and sets a session cookie.
9. The browser returns to TeXlyre.
10. TeXlyre calls `GET ${VITE_BACKEND_URL}/api/auth/session` to restore user info.

## What the frontend is responsible for

The frontend code in `src/services/backend/AuthBackendApi.ts` implements the browser-side contract:

- `initiateOidcLogin()` navigates to the backend authorize endpoint.
- `getOidcSession()` asks the backend for the current authenticated session.
- `backendLogout()` tells the backend to clear the session.

The auth context in `src/contexts/AuthContext.tsx` then:

- checks whether backend auth is enabled,
- restores the session when the app starts,
- converts the returned external user into a local authenticated user,
- exposes login via the OIDC button in `src/components/auth/Login.tsx`.

## What the backend is responsible for

The backend must:

- implement `GET /api/auth/oidc/authorize`
- implement `GET /api/auth/oidc/callback`
- implement `GET /api/auth/session`
- implement `POST /api/auth/logout`
- store session state server-side and send a secure session cookie
- keep the OIDC client secret on the backend only

The backend is the only component that should know the secret and exchange the code for tokens.

## Local auth compatibility

This setup does not remove TeXlyre’s existing local auth support. Guest accounts and username/password login still work alongside OIDC.

When backend auth is enabled, OIDC appears as an additional login option.

## Frontend environment variables

The following variables are used by the frontend/app build:

- `VITE_BACKEND_URL`
  - URL of the backend that handles auth.
  - Example: `http://localhost:4000`
  - When set, TeXlyre will use backend auth flows.

- `VITE_BACKEND_AUTH_ENABLED`
  - Optional flag to explicitly enable backend auth.
  - Set to `true` if you want backend auth active.
  - If omitted, backend auth is enabled automatically when `VITE_BACKEND_URL` exists.

- `VITE_TEXLYRE_OIDC_PROVIDER_NAME`
  - Optional label for the login button.
  - Example: `Keycloak`.
  - If unset, the button uses a generic label such as “OIDC Provider.”

## Backend endpoints required by the frontend

The frontend expects these backend routes:

- `GET /api/auth/oidc/authorize`
  - Begin OIDC login and redirect the browser to the provider.

- `GET /api/auth/session`
  - Return the current logged-in user and token data.
  - Should return `401` if no backend session exists.

- `POST /api/auth/logout`
  - Terminate the backend session.

## OIDC provider configuration

The backend must be registered as an OIDC client with the identity provider.

Required settings:

- `Client ID`
  - The identifier assigned by the provider.

- `Client Secret`
  - Confidential backend secret for token exchange.
  - Must never be exposed in browser or frontend code.

- `Redirect URI` / `Callback URL`
  - The provider sends the user back here after login.
  - Must exactly match the backend callback route.
  - Example for local test: `http://localhost:4000/api/auth/oidc/callback`

- `Scopes`
  - Use `openid email profile`.
  - Add extra scopes only if you need additional claims.

- `Response type`
  - Must be `code`.

- `Grant type`
  - Authorization code grant.

### Important note about this implementation

This setup uses the standard OIDC authorization code flow with a backend client secret.

It does not use PKCE from the browser. The backend is expected to keep the client secret secure.

## Common Keycloak setup

For your Keycloak server, register the `texlyre` client and use these endpoints:

- Issuer: `https://sso.fb1.uni-bremen.de/sso/realms/master`
- Authorization URL: `https://sso.fb1.uni-bremen.de/sso/realms/master/protocol/openid-connect/auth`
- Token URL: `https://sso.fb1.uni-bremen.de/sso/realms/master/protocol/openid-connect/token`
- Userinfo URL: `https://sso.fb1.uni-bremen.de/sso/realms/master/protocol/openid-connect/userinfo`
- Logout URL: `https://sso.fb1.uni-bremen.de/sso/realms/master/protocol/openid-connect/logout`
- Client ID: `texlyre`
- Client secret: keep it on the backend only
- Valid redirect URI: `http://localhost:4000/api/auth/oidc/callback`

In Keycloak, enable:

- `Authorization Code` flow
- `openid` scope
- `email` scope
- `profile` scope

If Keycloak rejects the redirect, the fix is almost always to add the exact callback URL to the client’s valid redirect URIs.

## Backend `.env` example

This sample shows the backend config values needed for OIDC.

```env
# Frontend/backend integration
VITE_BACKEND_URL=http://localhost:4000
VITE_BACKEND_AUTH_ENABLED=true
VITE_TEXLYRE_OIDC_PROVIDER_NAME=Keycloak

# Backend server configuration
BACKEND_PORT=4000
SITE_URL=http://localhost:4000
FRONTEND_URL=http://localhost:5173/texlyre/
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# OIDC provider configuration
OIDC_CLIENT_ID=texlyre
OIDC_CLIENT_SECRET=your-client-secret
OIDC_ISSUER=https://sso.fb1.uni-bremen.de/sso/realms/master
OIDC_AUTHORIZATION_URL=https://sso.fb1.uni-bremen.de/sso/realms/master/protocol/openid-connect/auth
OIDC_TOKEN_URL=https://sso.fb1.uni-bremen.de/sso/realms/master/protocol/openid-connect/token
OIDC_USER_INFO_URL=https://sso.fb1.uni-bremen.de/sso/realms/master/protocol/openid-connect/userinfo
OIDC_LOGOUT_URL=https://sso.fb1.uni-bremen.de/sso/realms/master/protocol/openid-connect/logout
OIDC_SCOPE=openid email profile
```

> Keep `OIDC_CLIENT_SECRET` confidential on the backend and never expose it in browser or static frontend files.

## Notes

- The frontend only uses the backend as an auth gateway.
- The backend performs the actual OIDC login, token exchange, and session management.
- This keeps provider secrets off the client and preserves TeXlyre’s local-first application model.
