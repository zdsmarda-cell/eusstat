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
 * Podporuje:
 * - Runtime konfiguraci přes window.__APP_CONFIG__
 * - Proměnnou VITE_API_URL
 * - Proměnnou APP_PORT / VITE_APP_PORT z .env (např. 3030)
 * - Fallback na relativní cestu "" (např. při stejném portu nebo proxy)
 */
export function getApiBaseUrl(): string {
  // 1. Runtime explicitní API URL
  if (typeof window !== 'undefined' && window.__APP_CONFIG__?.API_URL) {
    return window.__APP_CONFIG__.API_URL.replace(/\/+$/, '');
  }

  // 2. Vite build VITE_API_URL
  const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envApiUrl && envApiUrl.trim()) {
    return envApiUrl.replace(/\/+$/, '');
  }

  // 3. Port z runtime nebo z .env (APP_PORT, VITE_APP_PORT)
  const runtimePort = window?.__APP_CONFIG__?.APP_PORT?.toString();
  const envPort = ((import.meta.env.VITE_APP_PORT || import.meta.env.APP_PORT) as string | undefined)?.trim();
  const targetPort = runtimePort || envPort;

  if (typeof window !== 'undefined' && targetPort) {
    const currentPort = window.location.port;
    // Pokud aktuální port v prohlížeči není cílový port a neběžíme na výchozím preview
    if (currentPort !== targetPort && window.location.hostname !== 'localhost' && !window.location.hostname.includes('run.app')) {
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      return `${protocol}//${hostname}:${targetPort}`;
    }
  }

  // 4. Výchozí relativní cesta (pro preview, localhost a standardní proxy)
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
