import { supabase } from '../lib/supabase';
import { useImpersonateStore } from '../stores/impersonateStore';

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const impersonatedUserId = useImpersonateStore.getState().impersonatedUserId;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (impersonatedUserId) headers['x-impersonate'] = impersonatedUserId;
  return headers;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const base = import.meta.env.VITE_API_URL ?? '';
  const resp = await fetch(`${base}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}
