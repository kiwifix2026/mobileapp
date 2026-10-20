// Thin fetch wrapper around the existing NestJS backend at api.kiwifix.nz —
// the same backend the web app (kififix-forntend) and admin portal
// (kiwifix-admin) already talk to. No separate mobile API, just a new
// client for the API that already exists.
// Set per build profile in eas.json (EXPO_PUBLIC_API_BASE). Falls back to dev
// when running locally (`expo start`) and prod for any release build with no
// explicit value, so a local run can never touch production data by accident.
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ||
  (__DEV__ ? 'https://dev.api.kiwifix.nz' : 'https://api.kiwifix.nz');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type FetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null; // Bearer token — customer JWT or tradie JWT depending on caller
};

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  // Backend error responses are NestJS's standard { statusCode, message }
  // shape (see e.g. UnauthorizedException('Incorrect code.')) — surface
  // that message directly rather than a generic "request failed".
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new ApiError(message, res.status);
  }

  // Some endpoints (e.g. job delete) return 200 with no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
