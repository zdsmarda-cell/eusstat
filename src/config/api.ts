// src/config/api.ts

declare global {
  interface Window {
    __APP_CONFIG__?: {
      API_URL?: string;
      APP_PORT?: string | number;
    };
  }
}

/**
 * Získá základní URL pro volání API backendu.
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  // 1. Runtime konfigurace z index.html
  if (window.__APP_CONFIG__?.API_URL) {
    return window.__APP_CONFIG__.API_URL.replace(/\/+$/, '');
  }

  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  // 2. Automatická detekce pro produkční doménu eusstat.impossible.cz
  if (hostname === 'eusstat.impossible.cz') {
    const port = window.__APP_CONFIG__?.APP_PORT || 3030;
    if (window.location.port !== String(port)) {
      return `${protocol}//${hostname}:${port}`;
    }
  }

  // 3. Vite build proměnná VITE_API_URL
  const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envApiUrl && envApiUrl.trim()) {
    return envApiUrl.replace(/\/+$/, '');
  }

  // 4. Port z konfigurace nebo .env (APP_PORT, VITE_APP_PORT)
  const runtimePort = window.__APP_CONFIG__?.APP_PORT?.toString();
  const envPort = ((import.meta.env.VITE_APP_PORT || import.meta.env.APP_PORT) as string | undefined)?.trim();
  const targetPort = runtimePort || envPort;

  if (targetPort && window.location.port !== targetPort && hostname !== 'localhost' && !hostname.includes('run.app')) {
    return `${protocol}//${hostname}:${targetPort}`;
  }

  // 5. Výchozí relativní cesta (pro preview a vývoj)
  return '';
}

/**
 * Sestaví kompletní URL k API endpointu.
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

// =========================================================================
// JWT TOKEN MANAGEMENT & SECURE AUTHFETCH
// =========================================================================

const ACCESS_TOKEN_KEY = 'warehouse_jwt_access_token';
const REFRESH_TOKEN_KEY = 'warehouse_jwt_refresh_token';
const USER_KEY = 'warehouse_auth_user';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken: string, username?: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (username) {
    localStorage.setItem(USER_KEY, username);
  }
}

export function clearAuthTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('warehouse_auth_token'); // cleanup legacy token
}

let isRefreshing = false;
let refreshSubscribers: ((newToken: string | null) => void)[] = [];

function onTokenRefreshed(newToken: string | null) {
  refreshSubscribers.forEach(cb => cb(newToken));
  refreshSubscribers = [];
}

function subscribeTokenRefresh(cb: (newToken: string | null) => void) {
  refreshSubscribers.push(cb);
}

/**
 * Automaticky obnoví vypršený JWT token pomocí refresh tokenu
 */
export async function refreshJwtToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearAuthTokens();
    return null;
  }

  try {
    const res = await fetch(apiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      return null;
    }

    const data = await res.json();
    if (data.success && data.accessToken && data.refreshToken) {
      setAuthTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    }

    clearAuthTokens();
    window.dispatchEvent(new CustomEvent('auth:expired'));
    return null;
  } catch (err) {
    console.error('Chyba při obnově JWT tokenu:', err);
    return null;
  }
}

/**
 * authFetch: Zabezpečený HTTP klient pro volání chráněných API endpointů.
 * - Automaticky přikládá Authorization: Bearer <accessToken>
 * - Při 401 nebo vypršení platnosti tokenu automaticky provede refresh a zopakuje požadavek
 * - Pokud se refresh nezdaří, odhlásí uživatele a přesměruje na přihlašovací formulář
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(input, {
    ...init,
    headers,
  });

  // Pokud server vrátí 401 Unauthorized (např. TOKEN_EXPIRED)
  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      return response;
    }

    // Pokud už jiný požadavek právě provádí refresh, počkáme na jeho dokončení
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(async (newToken) => {
          if (!newToken) {
            resolve(response);
            return;
          }
          headers.set('Authorization', `Bearer ${newToken}`);
          try {
            const retryRes = await fetch(input, { ...init, headers });
            resolve(retryRes);
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    isRefreshing = true;
    try {
      const newToken = await refreshJwtToken();
      isRefreshing = false;
      onTokenRefreshed(newToken);

      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
        return await fetch(input, {
          ...init,
          headers,
        });
      }
    } catch (e) {
      isRefreshing = false;
      onTokenRefreshed(null);
    }
  }

  return response;
}
