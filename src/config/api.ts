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
 * 1. Runtime explicitní API_URL (window.__APP_CONFIG__.API_URL)
 * 2. Hardcoded pravidlo pro produkční doménu eusstat.impossible.cz -> https://eusstat.impossible.cz:3030
 * 3. Vite build VITE_API_URL
 * 4. Runtime / Build APP_PORT
 * 5. Fallback na relativní ""
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
    // Pokud prohlížeč není přímo na portu 3030
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
 * Např. apiUrl('/api/movements') -> 'https://eusstat.impossible.cz:3030/api/movements'
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
