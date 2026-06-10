function resolveApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL;

    if (typeof window !== 'undefined') {
      const currentHost = window.location.hostname;
      const isCurrentHostLocal = currentHost === 'localhost' || currentHost === '127.0.0.1';
      const pointsToLoopback = configuredUrl.includes('localhost') || configuredUrl.includes('127.0.0.1');

      // If app is opened by LAN IP but API URL points to loopback, swap host.
      if (!isCurrentHostLocal && pointsToLoopback) {
        return configuredUrl
          .replace('localhost', currentHost)
          .replace('127.0.0.1', currentHost);
      }
    }

    return configuredUrl;
  }

  // When opening the web app via LAN IP, reuse that host for API calls.
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:17643`;
  }

  return 'http://localhost:17643';
}

export type User = {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  nationalId: string | null;
  instagramUsername: string | null;
  birthDate: string | null;
  purchaseProofImage?: string | null;
  followsInstagram: boolean;
  role: 'USER' | 'SUPERADMIN';
  createdAt?: string;
};

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setToken(t: string|null) {
  if (typeof window === 'undefined') return;
  if (!t) localStorage.removeItem('token');
  else localStorage.setItem('token', t);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const API_URL = resolveApiUrl();
  const headers: any = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${API_URL}${path}`, { ...opts, headers, cache: 'no-store' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < maxAttempts) {
          await sleep(400 * attempt);
          continue;
        }
        const msg = data?.error || `Error ${res.status}`;
        throw new Error(msg);
      }

      return data as T;
    } catch (error) {
      const isNetworkError = error instanceof TypeError;
      if (isNetworkError && attempt < maxAttempts) {
        await sleep(400 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error('No se pudo conectar con el servidor');
}
