export function getCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  // The CSRF token is set by the middleware in the response headers
  const meta = document.querySelector('meta[name="x-csrf-token"]');
  return meta?.getAttribute('content') || null;
}

export async function fetchWithCsrf(url: string, options: RequestInit = {}) {
  const csrfToken = getCsrfToken();
  
  const headers = new Headers(options.headers);
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  
  return fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
}